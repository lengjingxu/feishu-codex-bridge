import type { Project, ProjectBindingStore, TopicBinding } from './types';

export interface NativeTopicSessionInput {
  project: Project;
  chatId: string;
  topicId: string;
  sessionId: string;
  createdBy: string;
  updatedAt?: number;
}

/**
 * Persist the Codex session created for a Feishu-native topic.
 *
 * Feishu may redeliver an event while the first run is starting. Re-read the
 * store before and after bindTopic so a duplicate delivery reuses the binding
 * instead of creating a second topic/session association.
 */
export async function bindNativeTopicSession(
  bindings: ProjectBindingStore,
  input: NativeTopicSessionInput,
): Promise<{ binding: TopicBinding; created: boolean }> {
  const current = bindings.findTopic(input.chatId, input.topicId);
  if (current) return { binding: current, created: false };

  const binding: TopicBinding = {
    chatId: input.chatId,
    topicId: input.topicId,
    projectKey: input.project.projectKey,
    codexThreadId: input.sessionId,
    createdBy: input.createdBy,
    updatedAt: input.updatedAt ?? Date.now(),
  };

  try {
    await bindings.bindTopic(binding);
    return { binding, created: true };
  } catch (err) {
    const raced = bindings.findTopic(input.chatId, input.topicId);
    if (raced) return { binding: raced, created: false };
    throw err;
  }
}
