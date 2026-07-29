import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { paths } from '../config/paths';
import type { Project } from './types';

export const FEISHU_ASSISTANT_PROJECT_KEY = 'assistant::feishu';

const AGENTS_CONTENT = `# Feishu Assistant

This directory is the dedicated Codex workspace for work initiated from Feishu or Lark.

- Use the Feishu context supplied by the client to understand the current chat, topic, message, sender, and project binding.
- Use the installed \`lark-*\` skills and the local \`lark-cli\` for chat, document, wiki, task, calendar, and other Feishu operations.
- The Bridge is transport and session routing only. Do not expect it to provide or broker Feishu business-operation tools.
- Keep source message, document, and project provenance when summarizing or handing work to another local project.
- Let Codex's normal tool permissions and approval flow govern local commands and Feishu writes.
- Store durable assistant notes and generated artifacts in this project only when they are useful to future turns.
`;

/**
 * Materialize a real Codex workspace rather than a parallel assistant runtime.
 * Existing AGENTS.md files are never overwritten so operators can customize
 * the workspace after first launch.
 */
export async function ensureFeishuAssistantProject(
  cwd = paths.feishuAssistantProjectDir,
): Promise<Project> {
  await mkdir(cwd, { recursive: true, mode: 0o700 });
  try {
    await writeFile(join(cwd, 'AGENTS.md'), AGENTS_CONTENT, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
  return {
    projectKey: FEISHU_ASSISTANT_PROJECT_KEY,
    name: 'Feishu Assistant',
    cwd,
    kind: 'feishu-assistant',
    hostId: 'Codex',
  };
}
