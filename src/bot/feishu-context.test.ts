import type { NormalizedMessage } from '@larksuiteoapi/node-sdk';
import { describe, expect, it } from 'vitest';
import { buildFeishuDocumentContext, buildFeishuTurnContext, FEISHU_TURN_CONTEXT_KEY } from './feishu-context';

describe('Feishu Codex additional context', () => {
  it('serializes routing provenance separately from the user prompt', () => {
    const msg = {
      messageId: 'om_message',
      chatId: 'oc_chat',
      chatType: 'group',
      senderId: 'ou_sender',
      senderName: '用户',
      threadId: 'omt_topic',
      rootId: 'om_root',
      replyToMessageId: 'om_parent',
      content: '总结群聊',
      resources: [],
      rawContentType: 'text',
    } as unknown as NormalizedMessage;
    const context = buildFeishuTurnContext([msg], {
      projectKey: 'assistant::feishu',
      name: 'Feishu Assistant',
      cwd: '/tmp/assistant',
      kind: 'feishu-assistant',
    });
    const entry = context?.[FEISHU_TURN_CONTEXT_KEY];
    expect(entry?.kind).toBe('application');
    expect(JSON.parse(entry?.value ?? '{}')).toMatchObject({
      source: 'feishu-bridge',
      chat: { id: 'oc_chat', type: 'group' },
      topic: { id: 'omt_topic' },
      message: { id: 'om_message', rootId: 'om_root', replyToMessageId: 'om_parent' },
      sender: { openId: 'ou_sender', name: '用户' },
      project: { key: 'assistant::feishu', kind: 'feishu-assistant' },
    });
  });

  it('injects document comment provenance', () => {
    const context = buildFeishuDocumentContext({
      fileToken: 'doc_token',
      fileType: 'docx',
      commentId: 'comment_1',
      replyId: 'reply_1',
      operatorOpenId: 'ou_sender',
    });
    expect(JSON.parse(context[FEISHU_TURN_CONTEXT_KEY]!.value)).toMatchObject({
      document: { fileToken: 'doc_token', commentId: 'comment_1', replyId: 'reply_1' },
      sender: { openId: 'ou_sender' },
    });
  });
});
