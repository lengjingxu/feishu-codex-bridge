import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { JsonProjectBindingStore } from './store';
import { showProjectWorkbench } from './workbench';
import type { Project } from './types';

const project: Project = {
  projectKey: 'local::/tmp/demo', name: 'demo', cwd: '/tmp/demo', hostId: 'local', chatId: 'chat-1',
};

describe('project workbench', () => {
  it('creates one home card and updates it on later requests', async () => {
    const store = new JsonProjectBindingStore(join(await mkdtemp(join(tmpdir(), 'feishu-workbench-')), 'bindings.json'));
    store.registerProjects([project]);
    await store.bindProject(project.projectKey, project.chatId!);
    const send = vi.fn().mockResolvedValue({ messageId: 'home-1' });
    const updateCard = vi.fn().mockResolvedValue(undefined);
    const channel = { send, updateCard } as never;

    await showProjectWorkbench(channel, store, project);
    expect(send).toHaveBeenCalledTimes(1);
    expect(store.findProjectByChat('chat-1')?.homeMessageId).toBe('home-1');

    await showProjectWorkbench(channel, store, store.findProjectByChat('chat-1')!);
    expect(updateCard).toHaveBeenCalledWith('home-1', expect.objectContaining({ header: expect.any(Object) }));
    expect(send).toHaveBeenCalledTimes(1);
  });
});
