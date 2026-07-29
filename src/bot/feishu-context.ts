import type { NormalizedMessage } from '@larksuiteoapi/node-sdk';
import type { AgentAdditionalContext } from '../agent/types';
import type { Project } from '../project/types';

export const FEISHU_TURN_CONTEXT_KEY = 'feishu.bridge.turn';

/**
 * Keep transport metadata out of the user's prompt while still giving Codex
 * enough precise provenance to select and operate its installed Feishu tools.
 */
export function buildFeishuTurnContext(
  messages: NormalizedMessage[],
  project?: Project,
): AgentAdditionalContext | undefined {
  const current = messages.at(-1);
  if (!current) return undefined;
  const value = {
    source: 'feishu-bridge',
    chat: {
      id: current.chatId,
      type: current.chatType,
    },
    topic: current.threadId ? { id: current.threadId } : undefined,
    message: {
      id: current.messageId,
      rootId: current.rootId,
      replyToMessageId: current.replyToMessageId,
      batchMessageIds: messages.map((message) => message.messageId),
    },
    sender: {
      openId: current.senderId,
      name: current.senderName,
    },
    project: project ? {
      key: project.projectKey,
      name: project.name,
      kind: project.kind ?? 'local',
      cwd: project.cwd,
    } : undefined,
  };
  return {
    [FEISHU_TURN_CONTEXT_KEY]: {
      kind: 'application',
      value: JSON.stringify(value),
    },
  };
}

export function buildFeishuDocumentContext(input: {
  fileToken: string;
  fileType: string;
  commentId: string;
  replyId?: string;
  operatorOpenId?: string;
}): AgentAdditionalContext {
  return {
    [FEISHU_TURN_CONTEXT_KEY]: {
      kind: 'application',
      value: JSON.stringify({
        source: 'feishu-bridge',
        document: {
          fileToken: input.fileToken,
          fileType: input.fileType,
          commentId: input.commentId,
          replyId: input.replyId,
        },
        sender: input.operatorOpenId ? { openId: input.operatorOpenId } : undefined,
      }),
    },
  };
}
