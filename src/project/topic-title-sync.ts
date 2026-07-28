import type { LarkChannel } from '@larksuiteoapi/node-sdk';
import type { AgentAdapter } from '../agent/types';
import { threadTitleFromText } from '../bot/thread-title';
import { fetchQuotedContext } from '../bot/quote';
import { log } from '../core/logger';
import type { ProjectBindingStore } from './types';

export async function fetchFeishuTopicTitle(
  channel: LarkChannel,
  topicId: string,
  knownRootMessageId?: string,
): Promise<string | undefined> {
  const rootMessageId = knownRootMessageId
    ?? await findTopicRootMessageId(channel, topicId);
  if (!rootMessageId) return undefined;
  const root = await fetchQuotedContext(channel, rootMessageId);
  if (!root?.content.trim()) return undefined;
  return threadTitleFromText(root.content);
}

export async function syncBoundTopicTitles(
  channel: LarkChannel,
  agent: AgentAdapter,
  bindings: ProjectBindingStore,
): Promise<{ renamed: number; unchanged: number; unavailable: number }> {
  if (!agent.renameSession || !bindings.allTopics) {
    return { renamed: 0, unchanged: 0, unavailable: 0 };
  }

  const currentNames = await loadCurrentNames(agent);
  let renamed = 0;
  let unchanged = 0;
  let unavailable = 0;

  for (const topic of bindings.allTopics()) {
    const title = await fetchFeishuTopicTitle(channel, topic.topicId);
    if (!title) {
      unavailable++;
      continue;
    }
    if (currentNames.get(topic.codexThreadId) === title) {
      unchanged++;
      continue;
    }
    try {
      await agent.renameSession(topic.codexThreadId, title);
      renamed++;
      log.info('session', 'topic-title-synced', {
        topicId: topic.topicId,
        sessionId: topic.codexThreadId,
        title,
      });
    } catch (err) {
      unavailable++;
      log.warn('session', 'topic-title-sync-failed', {
        topicId: topic.topicId,
        sessionId: topic.codexThreadId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { renamed, unchanged, unavailable };
}

async function findTopicRootMessageId(
  channel: LarkChannel,
  topicId: string,
): Promise<string | undefined> {
  try {
    const response = await channel.rawClient.im.v1.message.list({
      params: {
        container_id_type: 'thread',
        container_id: topicId,
        sort_type: 'ByCreateTimeAsc',
        page_size: 1,
        card_msg_content_type: 'user_card_content',
      },
    });
    const first = response.data?.items?.[0];
    return first?.root_id ?? first?.message_id;
  } catch (err) {
    log.warn('session', 'topic-root-fetch-failed', {
      topicId,
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

async function loadCurrentNames(agent: AgentAdapter): Promise<Map<string, string>> {
  if (!agent.listRecentSessions) return new Map();
  try {
    return new Map(
      (await agent.listRecentSessions())
        .filter((session): session is typeof session & { name: string } => Boolean(session.name))
        .map((session) => [session.threadId, session.name]),
    );
  } catch (err) {
    log.warn('session', 'topic-title-index-unavailable', {
      err: err instanceof Error ? err.message : String(err),
    });
    return new Map();
  }
}
