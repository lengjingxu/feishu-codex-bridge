import type { NormalizedMessage } from '@larksuiteoapi/node-sdk';
import { log } from '../core/logger';

interface PendingEntry {
  messages: NormalizedMessage[];
  timer?: NodeJS.Timeout;
}

export type FlushHandler = (scope: string, batch: NormalizedMessage[]) => void;

export interface PendingQueueOptions {
  /** Maximum messages retained for one chat/topic while its Agent is busy. */
  maxMessagesPerScope?: number;
  /** Maximum messages retained across the bridge instance. */
  maxTotalMessages?: number;
}

/**
 * Per-scope debounce queue. `scope` is the session scope string (typically
 * `chatId` for p2p / regular group, `chatId:threadId` for topic groups).
 * Accumulates messages within the same scope inside a quiet window, then
 * flushes as a single batch.
 *
 * `block(scope)` pauses the debounce timer while an agent run is active on
 * that scope — pushed messages still accumulate but no flush fires until
 * `unblock(scope)`, which arms a fresh quiet window.
 *
 * Commands should bypass this queue — they're cheap and should be responsive.
 */
export class PendingQueue {
  private readonly map = new Map<string, PendingEntry>();
  private readonly blocked = new Set<string>();
  private readonly delayMs: number;
  private readonly onFlush: FlushHandler;
  private readonly maxMessagesPerScope: number;
  private readonly maxTotalMessages: number;
  private totalMessages = 0;

  constructor(delayMs: number, onFlush: FlushHandler, options: PendingQueueOptions = {}) {
    this.delayMs = delayMs;
    this.onFlush = onFlush;
    this.maxMessagesPerScope = Math.max(1, Math.floor(options.maxMessagesPerScope ?? 100));
    this.maxTotalMessages = Math.max(1, Math.floor(options.maxTotalMessages ?? 1000));
  }

  push(scope: string, msg: NormalizedMessage): number {
    const existing = this.map.get(scope);
    if (existing) {
      if (existing.timer) clearTimeout(existing.timer);
      if (existing.messages.length >= this.maxMessagesPerScope || this.totalMessages >= this.maxTotalMessages) {
        log.warn('queue', 'drop-overflow', {
          scope,
          scopeMessages: existing.messages.length,
          totalMessages: this.totalMessages,
          maxMessagesPerScope: this.maxMessagesPerScope,
          maxTotalMessages: this.maxTotalMessages,
        });
        existing.timer = this.blocked.has(scope) ? undefined : this.armTimer(scope);
        return existing.messages.length;
      }
      existing.messages.push(msg);
      this.totalMessages++;
      existing.timer = this.blocked.has(scope) ? undefined : this.armTimer(scope);
      return existing.messages.length;
    }
    if (this.totalMessages >= this.maxTotalMessages) {
      log.warn('queue', 'drop-overflow', {
        scope,
        scopeMessages: 0,
        totalMessages: this.totalMessages,
        maxMessagesPerScope: this.maxMessagesPerScope,
        maxTotalMessages: this.maxTotalMessages,
      });
      return 0;
    }
    this.map.set(scope, {
      messages: [msg],
      timer: this.blocked.has(scope) ? undefined : this.armTimer(scope),
    });
    this.totalMessages++;
    return 1;
  }

  cancel(scope: string): NormalizedMessage[] {
    const entry = this.map.get(scope);
    if (!entry) return [];
    if (entry.timer) clearTimeout(entry.timer);
    this.map.delete(scope);
    this.totalMessages -= entry.messages.length;
    return entry.messages;
  }

  cancelAll(): void {
    for (const entry of this.map.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.map.clear();
    this.blocked.clear();
    this.totalMessages = 0;
  }

  /** Pause the debounce timer; pushed messages keep accumulating. */
  block(scope: string): void {
    if (this.blocked.has(scope)) return;
    this.blocked.add(scope);
    const entry = this.map.get(scope);
    if (entry?.timer) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    log.info('queue', 'blocked', { scope, queued: entry?.messages.length ?? 0 });
  }

  /** Resume the debounce timer; arms a fresh quiet window if anything queued. */
  unblock(scope: string): void {
    if (!this.blocked.has(scope)) return;
    this.blocked.delete(scope);
    const entry = this.map.get(scope);
    log.info('queue', 'unblocked', { scope, queued: entry?.messages.length ?? 0 });
    if (!entry || entry.messages.length === 0) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = this.armTimer(scope);
  }

  private armTimer(scope: string): NodeJS.Timeout {
    return setTimeout(() => this.flush(scope), this.delayMs);
  }

  private flush(scope: string): void {
    const entry = this.map.get(scope);
    if (!entry) return;
    this.map.delete(scope);
    this.totalMessages -= entry.messages.length;
    try {
      this.onFlush(scope, entry.messages);
    } catch (err) {
      log.fail('queue', err, { scope, batchSize: entry.messages.length });
    }
  }
}
