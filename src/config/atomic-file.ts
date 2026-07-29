import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Write a private file without exposing a partial or world-readable version.
 * The temporary inode is created exclusively and renamed only after the
 * contents have been flushed, so a crash cannot leave truncated JSON behind.
 */
export async function writeAtomicFile(
  path: string,
  content: string | Uint8Array,
  mode = 0o600,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(8).toString('hex')}`;
  let handle;
  try {
    handle = await open(tmp, 'wx', mode);
    await handle.writeFile(content);
    await handle.sync();
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  } finally {
    await handle?.close().catch(() => undefined);
  }

  try {
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}
