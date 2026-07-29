import { realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

/**
 * Check the resolved path against configured project roots. Resolving both
 * sides closes the common symlink escape where a path appears to be inside a
 * root lexically but points outside it on disk.
 */
export async function isWithinProjectRoots(
  candidate: string,
  roots: readonly string[],
): Promise<boolean> {
  let candidatePath: string;
  try {
    candidatePath = await realpath(resolve(candidate));
  } catch {
    return false;
  }

  for (const root of roots) {
    try {
      const rootPath = await realpath(resolve(root));
      const remainder = relative(rootPath, candidatePath);
      if (remainder === '' || (remainder !== '..' && !remainder.startsWith('../') && !remainder.startsWith('..\\'))) {
        return true;
      }
    } catch {
      // Ignore roots that disappeared; the caller can still report that the
      // candidate is outside the remaining valid roots.
    }
  }
  return false;
}
