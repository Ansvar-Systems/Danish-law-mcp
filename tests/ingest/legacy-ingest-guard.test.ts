/**
 * Legacy Swedish-template seed writer must be unreachable (PR #90 round 2).
 *
 * scripts/ingest-relevant-laws.ts imports ingest() from ingest-riksdagen.js —
 * Swedish Riksdagen API code with its own silent in_force defaulting and no
 * _ingest stamping — and writes slug-named seeds that the refresh worklist's
 * ^(\d{4})_(\d+)\.json$ regex can never see: poisoned seeds that can never
 * self-heal. Ported guard: Dutch-law-mcp FORCE_LEGACY_INGEST (exit 2 +
 * pointer).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('ingest-relevant-laws legacy guard', () => {
  it('exits 2 with a pointer unless FORCE_LEGACY_INGEST=1', { timeout: 30_000 }, () => {
    const env = { ...process.env };
    delete env.FORCE_LEGACY_INGEST;
    const res = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/ingest-relevant-laws.ts'],
      { cwd: ROOT, env, encoding: 'utf-8', timeout: 25_000 },
    );
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/FORCE_LEGACY_INGEST/);
    expect(res.stderr).toMatch(/ingest:auto-all|auto-ingest-all-statutes/);
  });

  it('is no longer shipped as an npm script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.scripts['ingest:relevant']).toBeUndefined();
  });
});
