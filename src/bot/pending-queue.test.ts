import type { NormalizedMessage } from '@larksuiteoapi/node-sdk';
import { describe, expect, it, vi } from 'vitest';
import { PendingQueue } from './pending-queue';

function message(id: string): NormalizedMessage {
  return { messageId: id } as NormalizedMessage;
}

describe('PendingQueue backpressure', () => {
  it('caps messages per scope and releases capacity after flush', () => {
    const flush = vi.fn();
    const queue = new PendingQueue(60_000, flush, { maxMessagesPerScope: 2, maxTotalMessages: 4 });

    expect(queue.push('scope', message('1'))).toBe(1);
    expect(queue.push('scope', message('2'))).toBe(2);
    expect(queue.push('scope', message('3'))).toBe(2);
    expect(flush).not.toHaveBeenCalled();

    queue.cancel('scope');
    expect(queue.push('scope', message('4'))).toBe(1);
    queue.cancelAll();
  });

  it('caps messages across scopes', () => {
    const flush = vi.fn();
    const queue = new PendingQueue(60_000, flush, { maxMessagesPerScope: 10, maxTotalMessages: 2 });

    expect(queue.push('one', message('1'))).toBe(1);
    expect(queue.push('two', message('2'))).toBe(1);
    expect(queue.push('three', message('3'))).toBe(0);
    queue.cancelAll();
  });
});
