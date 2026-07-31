import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { paths } from '../config/paths';
import { writeAtomicFile } from '../config/atomic-file';
import { log } from '../core/logger';
import type { NewTaskInput, TaskRecord, TaskStatus } from './types';

interface TaskData {
  version: 1;
  tasks: Record<string, TaskRecord>;
}

const emptyData = (): TaskData => ({ version: 1, tasks: {} });

export class JsonTaskStore {
  private data = emptyData();
  private saving: Promise<void> = Promise.resolve();
  private readonly path: string;

  constructor(path: string = paths.tasksFile) {
    this.path = path;
  }

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<TaskData>;
      this.data = {
        version: 1,
        tasks: parsed.tasks ?? {},
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  }

  /** A process restart ends all in-memory runs. Keep that fact visible. */
  markInFlightStale(): void {
    const now = Date.now();
    for (const task of Object.values(this.data.tasks)) {
      if (!isInFlight(task.status)) continue;
      task.status = 'stale';
      task.summary = 'Bridge 已重启，任务已停止；可打开原会话继续。';
      task.updatedAt = now;
      task.finishedAt = now;
    }
    this.schedulePersist();
  }

  create(input: NewTaskInput): TaskRecord {
    const now = Date.now();
    const task: TaskRecord = {
      taskId: `task_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      ...input,
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      status: 'running',
      toolCount: 0,
      failedToolCount: 0,
      testCount: 0,
      failedTestCount: 0,
    };
    this.data.tasks[task.taskId] = task;
    this.schedulePersist();
    return task;
  }

  get(taskId: string): TaskRecord | undefined {
    return this.data.tasks[taskId];
  }

  latestForScope(scope: string): TaskRecord | undefined {
    return Object.values(this.data.tasks)
      .filter((task) => task.scope === scope)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }

  list(limit = 30): TaskRecord[] {
    return Object.values(this.data.tasks)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, Math.max(1, limit));
  }

  update(taskId: string, patch: Partial<Omit<TaskRecord, 'taskId' | 'createdAt'>>): TaskRecord | undefined {
    const current = this.data.tasks[taskId];
    if (!current) return undefined;
    const next: TaskRecord = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    };
    this.data.tasks[taskId] = next;
    this.schedulePersist();
    return next;
  }

  finish(taskId: string, status: Extract<TaskStatus, 'succeeded' | 'failed' | 'cancelled' | 'stale'>, patch: Partial<TaskRecord> = {}): TaskRecord | undefined {
    return this.update(taskId, {
      ...patch,
      status,
      finishedAt: Date.now(),
    });
  }

  async flush(): Promise<void> {
    await this.saving;
  }

  private schedulePersist(): void {
    this.saving = this.saving
      .then(async () => writeAtomicFile(this.path, `${JSON.stringify(this.data, null, 2)}\n`))
      .catch((err) => log.fail('task', err, { step: 'persist' }));
  }
}

function isInFlight(status: TaskStatus): boolean {
  return status === 'queued'
    || status === 'running'
    || status === 'waiting_approval'
    || status === 'waiting_input';
}
