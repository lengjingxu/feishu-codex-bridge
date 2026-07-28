import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppConfig } from './schema';
import { saveConfig } from './store';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempConfigPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'feishu-config-test-'));
  tempDirs.push(dir);
  return join(dir, 'config.json');
}

const config: AppConfig = {
  accounts: {
    app: {
      id: 'cli_xxx',
      secret: { source: 'env', id: 'FEISHU_APP_SECRET' },
      tenant: 'feishu',
    },
  },
};

describe('saveConfig', () => {
  it('writes a complete private file without leaving temporary files', async () => {
    const path = await tempConfigPath();

    await saveConfig(config, path);

    await expect(readFile(path, 'utf8')).resolves.toBe(`${JSON.stringify(config, null, 2)}\n`);
    await expect(readdir(dirname(path))).resolves.toEqual(['config.json']);
    if (process.platform !== 'win32') {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
  });

  it('atomically replaces an existing config', async () => {
    const path = await tempConfigPath();
    await saveConfig(config, path);
    const updated: AppConfig = {
      ...config,
      preferences: { agentBackend: 'codex' },
    };

    await saveConfig(updated, path);

    await expect(readFile(path, 'utf8')).resolves.toBe(`${JSON.stringify(updated, null, 2)}\n`);
    await expect(readdir(dirname(path))).resolves.toEqual(['config.json']);
  });
});
