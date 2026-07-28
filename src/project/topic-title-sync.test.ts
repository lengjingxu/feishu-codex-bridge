import type { LarkChannel } from '@larksuiteoapi/node-sdk';
import { describe, expect, it, vi } from 'vitest';
import type { AgentAdapter } from '../agent/types';
import type { ProjectBindingStore, TopicBinding } from './types';
import { fetchFeishuTopicTitle, syncBoundTopicTitles } from './topic-title-sync';

function fakeChannel(title: string): LarkChannel {
  return {
    botIdentity: { openId: 'ou_bot', name: 'Codex' },
    rawClient: {
      im: {
        v1: {
          message: {
            async list() {
              return {
                data: {
                  items: [{
                    message_id: 'om_reply',
                    root_id: 'om_root',
                  }],
                },
              };
            },
            async get() {
              return {
                data: {
                  items: [{
                    message_id: 'om_root',
                    msg_type: 'text',
                    create_time: '1785208049000',
                    sender: { id: 'ou_user', id_type: 'open_id', sender_type: 'user' },
                    body: { content: JSON.stringify({ text: title }) },
                  }],
                },
              };
            },
          },
        },
      },
    },
  } as unknown as LarkChannel;
}

function fakeBindings(topic: TopicBinding): ProjectBindingStore {
  return {
    async bindProject() {},
    async bindProjectHomeMessage() {},
    async bindTopic() {},
    async updateTopicSession() {},
    findProjectByChat: () => undefined,
    findTopic: () => topic,
    findTopicByThread: () => topic,
    projectFor: () => undefined,
    topicsForProject: () => [topic],
    allTopics: () => [topic],
    async clearTopic() {},
    async flush() {},
  };
}

describe('Feishu topic title sync', () => {
  it('resolves the topic root message and normalizes its title', async () => {
    await expect(fetchFeishuTopicTitle(
      fakeChannel('  为什么我在飞书发起的 Codex 对话看不到  '),
      'omt_topic',
    )).resolves.toBe('为什么我在飞书发起的 Codex 对话看不到');
  });

  it('renames only sessions whose title differs from the Feishu topic', async () => {
    const topic: TopicBinding = {
      chatId: 'oc_chat',
      topicId: 'omt_topic',
      projectKey: 'local::/tmp/project',
      codexThreadId: 'thread-1',
      createdBy: 'ou_user',
      updatedAt: 1,
    };
    const renameSession = vi.fn(async () => {});
    const agent = {
      id: 'codex',
      displayName: 'Codex',
      isAvailable: async () => true,
      run: vi.fn(),
      listRecentSessions: async () => [{
        threadId: 'thread-1',
        name: '<bridge_context> chat_id: oc_chat',
        preview: '旧标题',
        cwd: '/tmp/project',
        status: 'idle' as const,
        updatedAt: 1,
      }],
      renameSession,
    } as unknown as AgentAdapter;

    await expect(syncBoundTopicTitles(
      fakeChannel('飞书话题标题'),
      agent,
      fakeBindings(topic),
    )).resolves.toEqual({ renamed: 1, unchanged: 0, unavailable: 0 });
    expect(renameSession).toHaveBeenCalledWith('thread-1', '飞书话题标题');
  });
});
