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
import { buildWorklist, summarizeRun } from '../../scripts/lib/refresh-worklist.js';

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
    const s = summarizeRun({ ...empty, goneUpstream: [{ id: '1993_812', httpStatus: 404 }] });
    expect(s.exitCode).toBe(0);
    expect(s.lines.join('\n')).toContain('1993_812');
    expect(s.lines.join('\n')).toMatch(/gone/i);
  });
});
