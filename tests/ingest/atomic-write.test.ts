/**
 * Atomic seed writes (PR #90 round 2). fs.writeFileSync over an existing seed
 * opens with O_TRUNC: a kill/reboot mid-write destroys the previous good
 * consolidation and leaves torn JSON that the GONE path and additive mode
 * preserve forever. Writes must go to a sibling tmp file and rename over the
 * destination — the destination is never opened for truncation.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeFileAtomic } from '../../scripts/lib/atomic-write.js';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dk-atomic-test-'));
}

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

describe('writeFileAtomic', () => {
  it('writes the content and leaves no tmp sibling behind', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'seed.json');
    writeFileAtomic(file, '{"id":"2019:241"}\n');
    expect(fs.readFileSync(file, 'utf-8')).toBe('{"id":"2019:241"}\n');
    expect(fs.readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
  });

  it('replaces an existing file', () => {
    const dir = tmpDir();
    const file = path.join(dir, 'seed.json');
    fs.writeFileSync(file, 'OLD', 'utf-8');
    writeFileAtomic(file, 'NEW');
    expect(fs.readFileSync(file, 'utf-8')).toBe('NEW');
  });

  it.skipIf(isRoot)(
    'preserves the existing destination when the write fails — never truncate-then-write',
    () => {
      const dir = tmpDir();
      const file = path.join(dir, 'seed.json');
      fs.writeFileSync(file, '{"id":"1993:812","good":true}\n', 'utf-8');
      // Read-only directory: creating the tmp sibling fails. The destination
      // must be byte-identical afterwards — a plain writeFileSync would have
      // truncated it before failing.
      fs.chmodSync(dir, 0o555);
      try {
        expect(() => writeFileAtomic(file, '{"id":"WRONG"}')).toThrow();
        expect(fs.readFileSync(file, 'utf-8')).toBe('{"id":"1993:812","good":true}\n');
      } finally {
        fs.chmodSync(dir, 0o755);
      }
    },
  );

  it('does not invent missing directories — a bad path fails loud', () => {
    const dir = tmpDir();
    expect(() => writeFileAtomic(path.join(dir, 'nope', 'seed.json'), 'x')).toThrow();
  });
});
