import type { LarkChannel } from '@larksuiteoapi/node-sdk';
import { log } from '../core/logger';
import type { RunState } from './run-state';
import { renderText } from './text-renderer';

const DEFAULT_ROTATION_MS = 8 * 60_000;
const DEFAULT_UPDATE_THROTTLE_MS = 400;
const DEFAULT_MILESTONE_MIN_INTERVAL_MS = 60_000;
const MAX_PROGRESS_CHARS = 24_000;
const MAX_MILESTONE_CHARS = 4_000;

interface SendOptions {
  replyTo?: string;
  replyInThread?: boolean;
}

interface ReliableProgressOptions {
  rotationMs?: number;
  updateThrottleMs?: number;
  milestoneMinIntervalMs?: number;
  now?: () => number;
  renderFinal?: (state: RunState) => string;
}

export type ProgressCardRenderer = (
  state: RunState,
  meta: { updatedAt: number; handoff: boolean },
) => object;

/**
 * Reliable, long-running Feishu progress delivery.
 *
 * CardKit streaming cards are automatically closed by Feishu after roughly
 * ten minutes. This controller deliberately sends ordinary non-streaming
 * cards, patches them in place while a run is active, and rotates to a fresh
 * card before the old streaming lifetime would have elapsed. The card is the
 * single source of truth while updates work. We switch to ordinary messages
 * only after a card operation fails, so users never have to read the same
 * answer both in a card and in a separate message.
 */
export class ReliableProgress {
  private readonly rotationMs: number;
  private readonly updateThrottleMs: number;
  private readonly milestoneMinIntervalMs: number;
  private readonly now: () => number;
  private readonly renderFinal: (state: RunState) => string;
  private currentMessageId: string | undefined;
  private latestState: RunState;
  private chain: Promise<void> = Promise.resolve();
  private updateTimer: ReturnType<typeof setTimeout> | undefined;
  private rotationTimer: ReturnType<typeof setTimeout> | undefined;
  private degraded = false;
  private completed = false;
  private lastMilestoneAt = 0;
  private readonly seenMilestones = new Set<string>();

  constructor(
    private readonly channel: Pick<LarkChannel, 'send' | 'updateCard'>,
    private readonly chatId: string,
    private readonly sendOptions: SendOptions,
    private readonly renderCard: ProgressCardRenderer,
    initialState: RunState,
    options: ReliableProgressOptions = {},
  ) {
    this.latestState = initialState;
    this.rotationMs = options.rotationMs ?? DEFAULT_ROTATION_MS;
    this.updateThrottleMs = options.updateThrottleMs ?? DEFAULT_UPDATE_THROTTLE_MS;
    this.milestoneMinIntervalMs = options.milestoneMinIntervalMs
      ?? DEFAULT_MILESTONE_MIN_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.renderFinal = options.renderFinal ?? renderText;
  }

  async start(): Promise<void> {
    try {
      const sent = await this.channel.send(
        this.chatId,
        { card: this.renderCard(this.latestState, { updatedAt: this.now(), handoff: false }) },
        this.sendOptions,
      );
      this.currentMessageId = sent.messageId;
      this.armRotation();
      log.info('progress', 'started', { messageId: sent.messageId });
    } catch (err) {
      await this.degrade(err, 'initial-card-send');
    }
  }

  async update(state: RunState): Promise<void> {
    this.latestState = state;
    if (this.completed) return;
    // Once a card operation has failed, the card can no longer be trusted as
    // a delivery surface. Continue with occasional plain-text progress rather
    // than silently losing a long-running task's updates.
    if (this.degraded) {
      await this.maybeSendMilestone(state);
      return;
    }
    if (this.updateThrottleMs <= 0 || state.terminal !== 'running') {
      this.clearUpdateTimer();
      await this.enqueue(() => this.patchCurrent(false));
      return;
    }
    if (this.updateTimer) return;
    this.updateTimer = setTimeout(() => {
      this.updateTimer = undefined;
      void this.enqueue(() => this.patchCurrent(false));
    }, this.updateThrottleMs);
  }

  async complete(state: RunState): Promise<void> {
    if (this.completed) return;
    this.completed = true;
    this.latestState = state;
    this.clearTimers();

    await this.chain;
    let deliveredToCard = false;
    if (!this.degraded && this.currentMessageId) {
      try {
        await this.channel.updateCard(
          this.currentMessageId,
          this.renderCard(state, { updatedAt: this.now(), handoff: false }),
        );
        deliveredToCard = true;
      } catch (err) {
        this.degraded = true;
        log.fail('progress', err, { step: 'final-card-update' });
      }
    }

    if (deliveredToCard) {
      log.info('progress', 'final-card-updated', { terminal: state.terminal });
      return;
    }

    const finalBody = this.renderFinal(state).trim() || '（未返回内容）';
    await this.channel.send(this.chatId, { markdown: finalBody }, this.sendOptions);
    log.info('progress', 'final-message-sent', { terminal: state.terminal });
  }

  async fail(err: unknown): Promise<void> {
    const message = err instanceof Error ? err.message : String(err);
    await this.complete({
      ...this.latestState,
      terminal: 'error',
      footer: null,
      errorMsg: message,
    });
  }

  private async patchCurrent(handoff: boolean): Promise<void> {
    if (this.degraded || this.completed || !this.currentMessageId) return;
    try {
      await this.channel.updateCard(
        this.currentMessageId,
        this.renderCard(this.latestState, { updatedAt: this.now(), handoff }),
      );
    } catch (err) {
      await this.degrade(err, handoff ? 'rotation-update' : 'card-update');
    }
  }

  private armRotation(): void {
    if (this.completed || this.degraded || this.rotationMs <= 0) return;
    this.clearRotationTimer();
    this.rotationTimer = setTimeout(() => {
      this.rotationTimer = undefined;
      void this.enqueue(() => this.rotate());
    }, this.rotationMs);
  }

  private async rotate(): Promise<void> {
    if (this.completed || this.degraded || this.latestState.terminal !== 'running') return;
    await this.patchCurrent(true);
    if (this.completed || this.degraded) return;

    try {
      const sent = await this.channel.send(
        this.chatId,
        { card: this.renderCard(this.latestState, { updatedAt: this.now(), handoff: false }) },
        this.sendOptions,
      );
      this.currentMessageId = sent.messageId;
      this.armRotation();
      log.info('progress', 'rotated', { messageId: sent.messageId, rotationMs: this.rotationMs });
    } catch (err) {
      await this.degrade(err, 'rotation-send');
    }
  }

  private async degrade(err: unknown, step: string): Promise<void> {
    if (this.degraded) return;
    this.degraded = true;
    this.clearTimers();
    log.fail('progress', err, { step });

    await this.channel.send(
      this.chatId,
      {
        markdown: '⚠️ 进度卡更新失败，后续进度将以普通消息发送；任务仍在继续。',
      },
      this.sendOptions,
    );
    log.info('progress', 'fallback-message-sent', { step });
  }

  private async maybeSendMilestone(state: RunState): Promise<void> {
    if (state.terminal !== 'running') return;
    const candidate = [...state.blocks].reverse().find(
      (block) => block.kind === 'text' && !block.streaming && block.content.trim().length > 0,
    );
    if (!candidate || candidate.kind !== 'text') return;
    const text = candidate.content.trim();
    if (this.seenMilestones.has(text)) return;
    this.seenMilestones.add(text);

    const now = this.now();
    if (this.lastMilestoneAt > 0 && now - this.lastMilestoneAt < this.milestoneMinIntervalMs) {
      return;
    }
    this.lastMilestoneAt = now;

    const content = text.length <= MAX_MILESTONE_CHARS
      ? text
      : `${text.slice(0, MAX_MILESTONE_CHARS - 1)}…`;
    try {
      await this.enqueue(async () => {
        await this.channel.send(
          this.chatId,
          { markdown: `**进度更新 · ${formatTime(now)}**\n\n${content}` },
          this.sendOptions,
        );
      });
      log.info('progress', 'milestone-message-sent', { chars: content.length });
    } catch (err) {
      // This only runs after card delivery has degraded. A milestone send
      // failure is logged, while the final ordinary message remains the
      // delivery guarantee.
      log.fail('progress', err, { step: 'milestone-send' });
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.chain.then(operation, operation);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private clearTimers(): void {
    this.clearUpdateTimer();
    this.clearRotationTimer();
  }

  private clearUpdateTimer(): void {
    if (!this.updateTimer) return;
    clearTimeout(this.updateTimer);
    this.updateTimer = undefined;
  }

  private clearRotationTimer(): void {
    if (!this.rotationTimer) return;
    clearTimeout(this.rotationTimer);
    this.rotationTimer = undefined;
  }
}

export function renderMarkdownProgressCard(
  state: RunState,
  meta: { updatedAt: number; handoff: boolean },
  taskId?: string,
): object {
  const renderedState = meta.handoff
    ? { ...state, terminal: 'done' as const, footer: null }
    : state;
  const body = truncateProgress(renderText(renderedState).trim() || '正在思考…');
  const note = meta.handoff
    ? `进度已转移到下一张卡 · ${formatTime(meta.updatedAt)}`
    : `最后更新：${formatTime(meta.updatedAt)}`;

  return {
    schema: '2.0',
    config: {
      // Full-card updates do not need CardKit's time-limited streaming mode.
      streaming_mode: false,
      summary: { content: summaryText(state, meta.updatedAt, taskId) },
    },
    body: {
      elements: [
        { tag: 'markdown', content: body },
        freshnessElement(note),
      ],
    },
  };
}

export function renderNonStreamingCard(
  cardRenderer: (state: RunState) => object,
): ProgressCardRenderer {
  return (state, meta) => {
    const renderedState = meta.handoff
      ? { ...state, terminal: 'done' as const, footer: null }
      : state;
    const card = cardRenderer(renderedState) as {
      config?: Record<string, unknown>;
      body?: { elements?: object[] };
      [key: string]: unknown;
    };
    const elements = [...(card.body?.elements ?? [])];
    elements.push(freshnessElement(
      meta.handoff
        ? `进度已转移到下一张卡 · ${formatTime(meta.updatedAt)}`
        : `最后更新：${formatTime(meta.updatedAt)}`,
    ));
    return {
      ...card,
      config: { ...card.config, streaming_mode: false },
      body: { ...card.body, elements },
    };
  };
}

function freshnessElement(content: string): object {
  return {
    tag: 'markdown',
    content: `_${content}_`,
    text_size: 'notation',
  };
}

function summaryText(state: RunState, updatedAt: number, taskId?: string): string {
  const status = state.terminal === 'running'
    ? '执行中'
    : state.terminal === 'done'
      ? '已完成'
      : state.terminal === 'interrupted'
        ? '已中断'
        : '执行异常';
  const task = taskId ? `任务 #${taskId.replace(/^task_/, '').slice(0, 8).toUpperCase()} · ` : '';
  return `${task}${status} · ${formatTime(updatedAt)}`;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

function truncateProgress(text: string): string {
  if (text.length <= MAX_PROGRESS_CHARS) return text;
  const headChars = 3_000;
  const marker = '\n\n_中间进度已省略，保留开头与最新内容_\n\n';
  const tailChars = MAX_PROGRESS_CHARS - headChars - marker.length;
  return `${text.slice(0, headChars)}${marker}${text.slice(-tailChars)}`;
}
