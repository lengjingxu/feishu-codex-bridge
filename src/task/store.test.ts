import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { JsonTaskStore } from './store';

function input() {
  return {
    scope: 'chat:topic',
    chatId: 'chat',
    topicId: 'topic',
    projectKey: 'local::/tmp/project',
    projectName: 'project',
    cwd: '/tmp/project',
    sourceMessageId: 'message',
    title: '修复问题',
    createdBy: 'user',
  };
}

describe('JsonTaskStore', () => {
  it('persists task lifecycle and lists newest first', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'feishu-task-store-'));
    const path = join(dir, 'tasks.json');
    const store = new JsonTaskStore(path);
    await store.load();
    const task = store.create(input());
    store.update(task.taskId, { stage: '运行测试', toolCount: 2 });
    store.finish(task.taskId, 'succeeded', { summary: '完成' });
    await store.flush();

    const restored = new JsonTaskStore(path);
    await restored.load();
    expect(restored.get(task.taskId)?.status).toBe('succeeded');
    expect(restored.latestForScope('chat:topic')?.summary).toBe('完成');
    expect(JSON.parse(await readFile(path, 'utf8')).tasks[task.taskId].sourceMessageId).toBe('message');
  });

  it('marks unfinished work stale after a process restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'feishu-task-store-'));
    const store = new JsonTaskStore(join(dir, 'tasks.json'));
    await store.load();
    const task = store.create(input());
    store.update(task.taskId, { status: 'waiting_input' });
    store.markInFlightStale();
    await store.flush();

    expect(store.get(task.taskId)?.status).toBe('stale');
    expect(store.get(task.taskId)?.summary).toContain('Bridge 已重启');
  });
});
