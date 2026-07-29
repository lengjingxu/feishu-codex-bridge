import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalProjectCatalog } from './catalog';
import type { AppConfig } from '../config/schema';

function cfg(projectRoots: string[]): AppConfig {
  return { accounts: { app: { id: 'cli_x', secret: 'secret', tenant: 'feishu' } }, preferences: { projectRoots } };
}

describe('LocalProjectCatalog', () => {
  it('normalizes configured directories into stable projects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'feishu-project-catalog-'));
    const nested = join(root, 'demo');
    await mkdir(nested);
    const projects = await new LocalProjectCatalog(cfg([`${nested}/.`])).list();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe('demo');
    expect(projects[0]?.projectKey).toBe(`local::${await realpath(nested)}`);
  });

  it('merges project directories discovered from Codex history', async () => {
    const root = await mkdtemp(join(tmpdir(), 'feishu-project-history-'));
    const nested = join(root, 'history-project');
    await mkdir(nested);
    const projects = await new LocalProjectCatalog(cfg([]), 'local', async () => [nested, nested]).list();
    expect(projects).toHaveLength(1);
    expect(projects[0]?.cwd).toBe(await realpath(nested));
  });

  it('materializes a dedicated Feishu Assistant Codex project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'feishu-assistant-catalog-'));
    const assistantRoot = join(root, 'assistant');
    const config = cfg([]);
    config.preferences = { agentBackend: 'codex' };
    const projects = await new LocalProjectCatalog(config, 'local', undefined, assistantRoot).list();

    expect(projects[0]).toMatchObject({
      projectKey: 'assistant::feishu',
      name: 'Feishu Assistant',
      cwd: assistantRoot,
      kind: 'feishu-assistant',
      hostId: 'Codex',
    });
    const instructions = await readFile(join(assistantRoot, 'AGENTS.md'), 'utf8');
    expect(instructions).toContain('installed `lark-*` skills');
    expect(instructions).toContain('transport and session routing only');

    await writeFile(join(assistantRoot, 'AGENTS.md'), 'custom instructions\n');
    await new LocalProjectCatalog(config, 'local', undefined, assistantRoot).list();
    expect(await readFile(join(assistantRoot, 'AGENTS.md'), 'utf8')).toBe('custom instructions\n');
  });
});
