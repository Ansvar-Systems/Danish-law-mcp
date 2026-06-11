/**
 * Crash-safe file replacement (PR #90 round 2).
 *
 * fs.writeFileSync opens the destination with O_TRUNC: a kill/reboot
 * mid-write destroys the previous good content and leaves torn JSON. During
 * a 63k-document sweep that torn seed survives forever on the GONE path and
 * in additive mode, and build-db crashes on it.
 *
 * Pattern: write a sibling `<file>.tmp`, fsync, rename over the destination.
 * rename(2) within one directory is atomic — readers observe either the old
 * or the new content, never a truncated file. No directories are invented:
 * a bad path fails loud.
 */

import * as fs from 'fs';

export function writeFileAtomic(filePath: string, data: string): void {
  const tmpPath = `${filePath}.tmp`;
  try {
    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup; the original error is what matters.
    }
    throw error;
  }
}
