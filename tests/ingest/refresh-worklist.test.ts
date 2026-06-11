/**
 * Worklist construction + fail-loud run summary (issue #89).
 *
 * The old bulk runner iterated sitemap entries only — 656 held seeds are
 * absent from today's sitemap and would silently never be revisited. The
 * refresh worklist is the UNION of sitemap docs and held seeds. The run
 * summary exits non-zero on any failure and enumerates failures and
 * gone-upstream findings instead of burying them in a log.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  applyLimit,
  buildWorklist,
  quarantineGoneSeed,
  readHeldSeedId,
  summarizeRun,
} from '../../scripts/lib/refresh-worklist.js';

describe('buildWorklist', () => {
  it('unions sitemap entries with held seeds and reconstructs URLs for seed-only docs', () => {
    const work = buildWorklist({
      sitemapEntries: [
        { id: '2026_510', url: 'https://retsinformation.dk/eli/lta/2026/510', lastmod: '2026-06-09' },
        { id: '2019_241', url: 'https://retsinformation.dk/eli/lta/2019/241', lastmod: '2019-03-16' },
      ],
      existingSeedIds: ['2019_241', '2007_1016'],
    });
    const byId = new Map(work.map((w) => [w.id, w]));
    expect(byId.size).toBe(3);
    expect(byId.get('2026_510')?.seedExists).toBe(false);
    expect(byId.get('2019_241')?.seedExists).toBe(true);
    const seedOnly = byId.get('2007_1016');
    expect(seedOnly?.seedExists).toBe(true);
    expect(seedOnly?.inSitemap).toBe(false);
    expect(seedOnly?.xmlUrl).toBe('https://www.retsinformation.dk/eli/lta/2007/1016/xml');
  });

  it('normalizes sitemap document URLs to the canonical https://www host and /xml payload', () => {
    const work = buildWorklist({
      sitemapEntries: [
        { id: '2026_510', url: 'https://retsinformation.dk/eli/lta/2026/510', lastmod: null },
      ],
      existingSeedIds: [],
    });
    expect(work[0].xmlUrl).toBe('https://www.retsinformation.dk/eli/lta/2026/510/xml');
  });
});

describe('summarizeRun', () => {
  const empty = {
    total: 10,
    fetched: 8,
    skipped: 2,
    failed: [] as Array<{ id: string; error: string }>,
    goneUpstream: [] as Array<{ id: string; httpStatus: number }>,
  };

  it('exit 0 on a clean run', () => {
    expect(summarizeRun(empty).exitCode).toBe(0);
  });

  it('exit 2 on partial failure — a partial sweep must never look complete', () => {
    const s = summarizeRun({ ...empty, failed: [{ id: '2019_241', error: 'HTTP 503 after retries' }] });
    expect(s.exitCode).toBe(2);
    expect(s.lines.join('\n')).toContain('2019_241');
  });

  it('gone-upstream findings are enumerated but are not failures', () => {
    const s = summarizeRun({
      ...empty,
      goneUpstream: [{ id: '1993_812', httpStatus: 404, quarantined: true }],
    });
    expect(s.exitCode).toBe(0);
    expect(s.lines.join('\n')).toContain('1993_812');
    expect(s.lines.join('\n')).toMatch(/gone/i);
  });

  it('enumerates the quarantine action per gone seed (PR #90 round 2)', () => {
    const s = summarizeRun({
      ...empty,
      goneUpstream: [
        { id: '1993_812', httpStatus: 404, quarantined: true },
        { id: '2026_999', httpStatus: 410, quarantined: false },
      ],
    });
    expect(s.exitCode).toBe(0); // gone-only runs still exit 0
    const text = s.lines.join('\n');
    expect(text).toMatch(/1993_812.*quarantined/i);
    expect(text).toMatch(/2026_999.*no held seed/i);
  });
});

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dk-worklist-lib-test-'));
}

describe('quarantineGoneSeed (PR #90 round 2, Dutch 976c0ef pattern)', () => {
  it('renames the held seed into the quarantine dir — preserved, not deleted, not served', () => {
    const dir = tmpDir();
    const seedPath = path.join(dir, 'seed', '1993_812.json');
    fs.mkdirSync(path.dirname(seedPath), { recursive: true });
    fs.writeFileSync(seedPath, '{"id":"1993:812"}\n', 'utf-8');
    const quarantineDir = path.join(dir, 'seed-gone');

    const dest = quarantineGoneSeed(seedPath, quarantineDir);

    expect(dest).toBe(path.join(quarantineDir, '1993_812.json'));
    expect(fs.existsSync(seedPath)).toBe(false);
    expect(fs.readFileSync(dest as string, 'utf-8')).toBe('{"id":"1993:812"}\n');
  });

  it('returns null when there is no held seed to quarantine', () => {
    const dir = tmpDir();
    expect(quarantineGoneSeed(path.join(dir, 'absent.json'), path.join(dir, 'q'))).toBeNull();
  });
});

describe('readHeldSeedId (PR #90 round 2)', () => {
  it('returns the id we already serve — the identity gate compares against THIS, never a re-derived format', () => {
    const dir = tmpDir();
    const p = path.join(dir, '1852_11000.json');
    fs.writeFileSync(p, JSON.stringify({ id: 'AL000501', status: 'in_force' }), 'utf-8');
    expect(readHeldSeedId(p)).toBe('AL000501');
  });

  it('returns null for missing, torn, or id-less seeds — no held identity, served id becomes the identity', () => {
    const dir = tmpDir();
    expect(readHeldSeedId(path.join(dir, 'absent.json'))).toBeNull();
    const torn = path.join(dir, 'torn.json');
    fs.writeFileSync(torn, '{"id":"1993:8', 'utf-8');
    expect(readHeldSeedId(torn)).toBeNull();
    const idless = path.join(dir, 'idless.json');
    fs.writeFileSync(idless, '{"provisions":[]}', 'utf-8');
    expect(readHeldSeedId(idless)).toBeNull();
  });
});

describe('applyLimit (PR #90 round 2)', () => {
  type D = { id: string; decision: 'fetch_new' | 'refetch_unknown' | 'skip_current' | 'skip_existing' };
  const d = (id: string, decision: D['decision']): D => ({ id, decision });

  it('budgets only items that actually fetch — skips pass through free so chunked resumes advance', () => {
    const decided = [
      d('a', 'skip_current'),
      d('b', 'refetch_unknown'),
      d('c', 'skip_existing'),
      d('d', 'fetch_new'),
      d('e', 'refetch_unknown'), // over budget
    ];
    const queue = applyLimit(decided, 2);
    expect(queue.map((q) => q.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('a fully-stamped prefix no longer starves the budget', () => {
    // Regression: after chunk 1 stamped the first N items, every later
    // --limit N invocation processed only skips and reported fetched=0
    // while the sweep never advanced.
    const decided = [
      d('done1', 'skip_current'),
      d('done2', 'skip_current'),
      d('next1', 'refetch_unknown'),
    ];
    const queue = applyLimit(decided, 2);
    expect(queue.map((q) => q.id)).toContain('next1');
  });

  it('no limit returns the full worklist', () => {
    const decided = [d('a', 'fetch_new'), d('b', 'skip_current')];
    expect(applyLimit(decided, undefined)).toEqual(decided);
    expect(applyLimit(decided, 0)).toEqual(decided);
  });
});

describe('readHeldSeedId — error discrimination (PR #90 round 3)', () => {
  // Self-heal (null) is for missing/torn/id-less seeds ONLY. A transient fs
  // error (EACCES/EIO/EMFILE) is none of those: returning null would disable
  // the identity gate AND authorize overwriting the held good seed.
  it('returns null for a missing seed (ENOENT — the never-held case)', () => {
    expect(readHeldSeedId(path.join(tmpDir(), 'nope.json'))).toBeNull();
  });

  it('returns null for torn JSON (the documented self-heal class)', () => {
    const dir = tmpDir();
    const p = path.join(dir, 'torn.json');
    fs.writeFileSync(p, '{"id": "AL0005');
    expect(readHeldSeedId(p)).toBeNull();
  });

  it('THROWS on non-ENOENT fs errors instead of disabling the identity gate', () => {
    const dir = tmpDir();
    const p = path.join(dir, 'locked.json');
    fs.writeFileSync(p, JSON.stringify({ id: 'AL000501' }));
    fs.chmodSync(p, 0o000);
    try {
      expect(() => readHeldSeedId(p)).toThrow(/EACCES|permission/i);
    } finally {
      fs.chmodSync(p, 0o644);
    }
  });
});

describe('quarantineGoneSeed — evidence preservation (PR #90 round 3)', () => {
  it('never overwrites an existing quarantined file — uniquifies instead', () => {
    const dir = tmpDir();
    const qdir = path.join(dir, 'seed-gone');
    const seed = path.join(dir, '1993_812.json');
    fs.mkdirSync(qdir, { recursive: true });
    fs.writeFileSync(path.join(qdir, '1993_812.json'), '{"id":"run-1 evidence"}');
    fs.writeFileSync(seed, '{"id":"run-2 copy"}');
    const dest = quarantineGoneSeed(seed, qdir);
    expect(dest).not.toBeNull();
    expect(dest).not.toBe(path.join(qdir, '1993_812.json'));
    expect(fs.readFileSync(path.join(qdir, '1993_812.json'), 'utf-8')).toContain('run-1 evidence');
    expect(fs.readFileSync(dest as string, 'utf-8')).toContain('run-2 copy');
  });
});
