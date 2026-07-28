import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { JsonProjectBindingStore } from './store';
import { bindNativeTopicSession } from './topic-session';
import type { Project } from './types';

const project: Project = {
  projectKey: 'local::/tmp/demo',
  name: 'demo',
  cwd: '/tmp/demo',
  chatId: 'chat-1',
};

describe('native Feishu topic sessions', () => {
  it('binds a newly created Feishu topic to its first Codex session', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'feishu-topic-session-'));
    const store = new JsonProjectBindingStore(join(dir, 'bindings.json'));
    store.registerProjects([project]);

    const result = await bindNativeTopicSession(store, {
      project,
      chatId: 'chat-1',
      topicId: 'topic-1',
      sessionId: 'session-1',
      createdBy: 'user-1',
      updatedAt: 123,
    });

    expect(result.created).toBe(true);
    expect(store.findTopic('chat-1', 'topic-1')).toMatchObject({
      projectKey: project.projectKey,
      codexThreadId: 'session-1',
      createdBy: 'user-1',
    });
  });

  it('reuses an existing binding after duplicate Feishu delivery', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'feishu-topic-session-'));
    const store = new JsonProjectBindingStore(join(dir, 'bindings.json'));
    store.registerProjects([project]);
    const input = {
      project,
      chatId: 'chat-1',
      topicId: 'topic-1',
      sessionId: 'session-1',
      createdBy: 'user-1',
      updatedAt: 123,
    };

    await bindNativeTopicSession(store, input);
    const duplicate = await bindNativeTopicSession(store, { ...input, sessionId: 'session-2' });

    expect(duplicate.created).toBe(false);
    expect(duplicate.binding.codexThreadId).toBe('session-1');
    expect(store.topicsForProject(project.projectKey)).toHaveLength(1);
  });
});
