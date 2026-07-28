import type { LarkChannel } from '@larksuiteoapi/node-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initialState, reduce, type RunState } from './run-state';
import {
  ReliableProgress,
  renderMarkdownProgressCard,
  renderNonStreamingCard,
} from './reliable-progress';

function runningState(text = '正在处理'): RunState {
  return reduce(initialState, { type: 'text', delta: text });
}

function doneState(text = '处理完成'): RunState {
  return reduce(runningState(text), { type: 'done' });
}

function commentaryThenTool(text = '已经完成第一阶段'): RunState {
  return reduce(runningState(text), {
    type: 'tool_use',
    id: 'tool-1',
    name: 'bash',
    input: { command: 'pnpm test' },
  });
}

function fakeChannel(options: { updateError?: Error } = {}): {
  channel: Pick<LarkChannel, 'send' | 'updateCard'>;
  send: ReturnType<typeof vi.fn>;
  updateCard: ReturnType<typeof vi.fn>;
} {
  let messageNumber = 0;
  const send = vi.fn().mockImplementation(async () => ({
    messageId: `message-${++messageNumber}`,
  }));
  const updateCard = options.updateError
    ? vi.fn().mockRejectedValue(options.updateError)
    : vi.fn().mockResolvedValue(undefined);
  return {
    channel: { send, updateCard } as unknown as Pick<LarkChannel, 'send' | 'updateCard'>,
    send,
    updateCard,
  };
}

describe('ReliableProgress', () => {
  afterEach(() => vi.useRealTimers());

  it('always posts the final answer as a standalone markdown message', async () => {
    const { channel, send, updateCard } = fakeChannel();
    const progress = new ReliableProgress(
      channel,
      'chat-1',
      { replyTo: 'user-message', replyInThread: true },
      renderMarkdownProgressCard,
      initialState,
      { rotationMs: 0, updateThrottleMs: 0 },
    );

    await progress.start();
    await progress.update(runningState());
    await progress.complete(doneState('最终结果'));

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[1]).toEqual({ card: expect.any(Object) });
    expect(send.mock.calls[1]?.[1]).toEqual({ markdown: '最终结果' });
    expect(send.mock.calls[1]?.[2]).toEqual({
      replyTo: 'user-message',
      replyInThread: true,
    });
    expect(updateCard).toHaveBeenCalled();
  });

  it('rotates to a fresh progress card before a long task goes stale', async () => {
    vi.useFakeTimers();
    const { channel, send, updateCard } = fakeChannel();
    const progress = new ReliableProgress(
      channel,
      'chat-1',
      { replyTo: 'user-message', replyInThread: true },
      renderMarkdownProgressCard,
      runningState(),
      { rotationMs: 1_000, updateThrottleMs: 0 },
    );

    await progress.start();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(updateCard).toHaveBeenCalledTimes(1);
    const handoffCard = updateCard.mock.calls[0]?.[1] as {
      body: { elements: Array<{ elements?: Array<{ content?: string }> }> };
    };
    expect(handoffCard.body.elements.at(-1)?.elements?.[0]?.content).toContain('进度已转移');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[1]).toEqual({ card: expect.any(Object) });

    await progress.complete(doneState());
  });

  it('falls back to ordinary messages when a card update fails', async () => {
    const { channel, send, updateCard } = fakeChannel({
      updateError: new Error('card update timeout'),
    });
    const progress = new ReliableProgress(
      channel,
      'chat-1',
      { replyTo: 'user-message', replyInThread: true },
      renderMarkdownProgressCard,
      initialState,
      { rotationMs: 0, updateThrottleMs: 0 },
    );

    await progress.start();
    await progress.update(runningState('最新进度'));
    await progress.complete(doneState('最终完成'));

    expect(updateCard).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[1]?.[1]).toEqual({
      markdown: expect.stringContaining('已自动切换为普通消息'),
    });
    expect(send.mock.calls[2]?.[1]).toEqual({ markdown: '最终完成' });
  });

  it('posts completed commentary as a rate-limited milestone message', async () => {
    let now = Date.UTC(2026, 6, 28, 7, 30, 0);
    const { channel, send } = fakeChannel();
    const progress = new ReliableProgress(
      channel,
      'chat-1',
      { replyTo: 'user-message', replyInThread: true },
      renderMarkdownProgressCard,
      initialState,
      {
        rotationMs: 0,
        updateThrottleMs: 0,
        milestoneMinIntervalMs: 60_000,
        now: () => now,
      },
    );

    await progress.start();
    await progress.update(commentaryThenTool('第一阶段完成'));
    now += 30_000;
    await progress.update(commentaryThenTool('第二阶段完成'));

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[1]).toEqual({
      markdown: expect.stringContaining('第一阶段完成'),
    });

    await progress.complete(doneState());
  });
});

describe('renderMarkdownProgressCard', () => {
  it('keeps streaming mode disabled and shows a Beijing-time freshness marker', () => {
    const card = renderMarkdownProgressCard(runningState(), {
      updatedAt: Date.UTC(2026, 6, 28, 7, 30, 0),
      handoff: false,
    }) as {
      config: { streaming_mode: boolean; summary: { content: string } };
      body: { elements: Array<{ elements?: Array<{ content?: string }> }> };
    };

    expect(card.config.streaming_mode).toBe(false);
    expect(card.config.summary.content).toContain('15:30:00');
    expect(card.body.elements.at(-1)?.elements?.[0]?.content).toContain('最后更新：15:30:00');
  });

  it('forces rich progress cards out of streaming mode', () => {
    const renderer = renderNonStreamingCard(() => ({
      schema: '2.0',
      config: { streaming_mode: true },
      body: { elements: [{ tag: 'markdown', content: 'progress' }] },
    }));
    const card = renderer(runningState(), {
      updatedAt: Date.UTC(2026, 6, 28, 7, 30, 0),
      handoff: false,
    }) as {
      config: { streaming_mode: boolean };
      body: { elements: object[] };
    };

    expect(card.config.streaming_mode).toBe(false);
    expect(card.body.elements).toHaveLength(2);
  });
});
