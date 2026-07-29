import { mkdir, mkdtemp, symlink, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { isWithinProjectRoots } from './path-policy';

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('isWithinProjectRoots', () => {
  it('allows a root and its descendants', async () => {
    const root = await mkdtemp(join(tmpdir(), 'feishu-root-policy-'));
    dirs.push(root);
    const child = join(root, 'project');
    await mkdir(child);
    await writeFile(join(child, 'README.md'), 'ok');

    await expect(isWithinProjectRoots(child, [root])).resolves.toBe(true);
  });

  it('rejects sibling paths and symlinks that escape the root', async () => {
    if (process.platform === 'win32') return;
    const root = await mkdtemp(join(tmpdir(), 'feishu-root-policy-'));
    const outside = await mkdtemp(join(tmpdir(), 'feishu-outside-policy-'));
    dirs.push(root, outside);
    const link = join(root, 'escape');
    await symlink(outside, link);

    await expect(isWithinProjectRoots(outside, [root])).resolves.toBe(false);
    await expect(isWithinProjectRoots(link, [root])).resolves.toBe(false);
  });
});
