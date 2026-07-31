export type TaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'waiting_input'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'stale';

export interface TaskUsage {
  totalTokens?: number;
  contextTokens?: number;
  modelContextWindow?: number;
}

export interface TaskRecord {
  taskId: string;
  scope: string;
  chatId: string;
  topicId?: string;
  projectKey?: string;
  projectName?: string;
  cwd: string;
  codexThreadId?: string;
  turnId?: string;
  sourceMessageId: string;
  title: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
  status: TaskStatus;
  stage?: string;
  currentTool?: string;
  summary?: string;
  error?: string;
  toolCount: number;
  failedToolCount: number;
  testCount: number;
  failedTestCount: number;
  changedLines?: number;
  usage?: TaskUsage;
}

export interface NewTaskInput {
  scope: string;
  chatId: string;
  topicId?: string;
  projectKey?: string;
  projectName?: string;
  cwd: string;
  sourceMessageId: string;
  title: string;
  createdBy: string;
}
