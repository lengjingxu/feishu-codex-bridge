import { realpath, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { getEnableFeishuAssistantProject, getProjectRoots, type AppConfig } from '../config/schema';
import { paths } from '../config/paths';
import { log } from '../core/logger';
import type { Project } from './types';
import { ensureFeishuAssistantProject, FEISHU_ASSISTANT_PROJECT_KEY } from './assistant';

export interface ProjectCatalog {
  list(): Promise<Project[]>;
  get(projectKey: string): Promise<Project | undefined>;
}

export class LocalProjectCatalog implements ProjectCatalog {
  private readonly cfg: AppConfig;
  private readonly hostId: string;
  private readonly discoverRoots?: () => Promise<string[]>;
  private readonly assistantRoot: string;

  constructor(
    cfg: AppConfig,
    hostId = 'local',
    discoverRoots?: () => Promise<string[]>,
    assistantRoot = paths.feishuAssistantProjectDir,
  ) {
    this.cfg = cfg;
    this.hostId = hostId;
    this.discoverRoots = discoverRoots;
    this.assistantRoot = assistantRoot;
  }

  async list(): Promise<Project[]> {
    const roots = new Set(getProjectRoots(this.cfg));
    if (this.discoverRoots) {
      try {
        for (const root of await this.discoverRoots()) roots.add(root);
      } catch (err) {
        log.warn('project', 'history-discovery-failed', { err: String(err) });
      }
    }
    const projects: Project[] = [];
    for (const root of roots) {
      const project = await this.fromRoot(root);
      if (project) projects.push(project);
    }
    if (getEnableFeishuAssistantProject(this.cfg)) {
      projects.unshift(await ensureFeishuAssistantProject(this.assistantRoot));
    }
    return projects.sort((a, b) => {
      if (a.kind === 'feishu-assistant') return -1;
      if (b.kind === 'feishu-assistant') return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
  }

  async get(projectKey: string): Promise<Project | undefined> {
    if (projectKey === FEISHU_ASSISTANT_PROJECT_KEY) {
      return getEnableFeishuAssistantProject(this.cfg)
        ? ensureFeishuAssistantProject(this.assistantRoot)
        : undefined;
    }
    return (await this.list()).find((project) => project.projectKey === projectKey);
  }

  private async fromRoot(rawRoot: string): Promise<Project | undefined> {
    try {
      const cwd = await realpath(resolve(rawRoot));
      const info = await stat(cwd);
      if (!info.isDirectory()) return undefined;
      return {
        projectKey: `${this.hostId}::${cwd}`,
        name: basename(cwd) || cwd,
        cwd,
        kind: 'local',
        hostId: this.hostId,
      };
    } catch (err) {
      log.warn('project', 'root-unavailable', { root: rawRoot, err: String(err) });
      return undefined;
    }
  }
}
