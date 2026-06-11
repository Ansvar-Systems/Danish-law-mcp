/**
 * Sitemap parsing robustness + sanity floor (PR #90 round 2).
 *
 * The old <url> regex required the exact child sequence loc[,lastmod]: any
 * standard optional child (<changefreq>, <priority>) or reordering yielded
 * ZERO entries, and the union-with-held-seeds worklist then silently degraded
 * to a seeds-only run that exits 0 — dropping every never-held fetch_new
 * document. Parsing must be order-independent, and a sitemap that yields zero
 * pages or zero entries must FAIL the run.
 */
import { describe, it, expect } from 'vitest';
import {
  extractUrlEntries,
  extractSitemapLocs,
  collectSitemapEntries,
  SitemapSanityError,
} from '../../scripts/lib/sitemap.js';

describe('extractUrlEntries', () => {
  it('parses the current upstream shape (loc + lastmod)', () => {
    const xml = `<urlset><url><loc>https://retsinformation.dk/eli/lta/2019/241</loc><lastmod>2019-03-16</lastmod></url></urlset>`;
    expect(extractUrlEntries(xml)).toEqual([
      { loc: 'https://retsinformation.dk/eli/lta/2019/241', lastmod: '2019-03-16' },
    ]);
  });

  it('tolerates standard optional children (changefreq, priority)', () => {
    const xml = `<url><loc>https://x.dk/eli/lta/2019/241</loc><lastmod>2019-03-16</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>`;
    expect(extractUrlEntries(xml)).toEqual([
      { loc: 'https://x.dk/eli/lta/2019/241', lastmod: '2019-03-16' },
    ]);
  });

  it('tolerates child reordering (lastmod before loc)', () => {
    const xml = `<url><lastmod>2019-03-16</lastmod><loc>https://x.dk/eli/lta/2019/241</loc></url>`;
    expect(extractUrlEntries(xml)).toEqual([
      { loc: 'https://x.dk/eli/lta/2019/241', lastmod: '2019-03-16' },
    ]);
  });

  it('handles a missing lastmod and multiple url blocks', () => {
    const xml = `<urlset>
      <url><loc>https://x.dk/a</loc></url>
      <url><priority>0.1</priority><loc>https://x.dk/b</loc><lastmod>2020-01-01</lastmod></url>
    </urlset>`;
    expect(extractUrlEntries(xml)).toEqual([
      { loc: 'https://x.dk/a', lastmod: undefined },
      { loc: 'https://x.dk/b', lastmod: '2020-01-01' },
    ]);
  });
});

function indexXml(pages: string[]): string {
  return `<sitemapindex>${pages.map((p) => `<sitemap><loc>${p}</loc></sitemap>`).join('')}</sitemapindex>`;
}

function pageXml(entries: Array<{ loc: string; lastmod?: string }>): string {
  return `<urlset>${entries
    .map((e) => `<url><loc>${e.loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}<priority>0.5</priority></url>`)
    .join('')}</urlset>`;
}

function fakeFetchText(byUrl: Record<string, string>): (url: string) => Promise<string> {
  return async (url: string) => {
    const body = byUrl[url];
    if (body === undefined) throw new Error(`unexpected fetch: ${url}`);
    return body;
  };
}

const INDEX = 'https://www.retsinformation.dk/sitemap.xml';

describe('collectSitemapEntries', () => {
  const base = { indexUrl: INDEX, delayMs: 0, sleepFn: async () => {} };

  it('collects /eli/lta documents across pages and keeps the newest lastmod per id', async () => {
    const fetchText = fakeFetchText({
      [INDEX]: indexXml([`${INDEX}?page=1`, `${INDEX}?page=2`]),
      [`${INDEX}?page=1`]: pageXml([
        { loc: 'https://retsinformation.dk/eli/lta/2019/241', lastmod: '2019-03-16' },
        { loc: 'https://retsinformation.dk/eli/lta/2026/510' },
      ]),
      [`${INDEX}?page=2`]: pageXml([
        { loc: 'https://retsinformation.dk/eli/lta/2019/241', lastmod: '2026-01-01' },
        { loc: 'https://retsinformation.dk/about', lastmod: '2026-01-01' }, // non-document: ignored
      ]),
    });
    const entries = await collectSitemapEntries({ ...base, fetchText });
    const byId = new Map(entries.map((e) => [e.id, e]));
    expect(byId.size).toBe(2);
    expect(byId.get('2019_241')?.lastmod).toBe('2026-01-01');
    expect(byId.get('2026_510')?.lastmod).toBeNull();
  });

  it('FAILS the run when the index yields zero sitemap pages — never degrade to seeds-only', async () => {
    const fetchText = fakeFetchText({
      [INDEX]: '<html>maintenance</html>',
    });
    await expect(collectSitemapEntries({ ...base, fetchText })).rejects.toThrow(SitemapSanityError);
  });

  it('FAILS the run when the pages yield zero document entries', async () => {
    const fetchText = fakeFetchText({
      [INDEX]: indexXml([`${INDEX}?page=1`]),
      [`${INDEX}?page=1`]: '<urlset></urlset>',
    });
    await expect(collectSitemapEntries({ ...base, fetchText })).rejects.toThrow(SitemapSanityError);
  });

  it('applies year bounds', async () => {
    const fetchText = fakeFetchText({
      [INDEX]: indexXml([`${INDEX}?page=1`]),
      [`${INDEX}?page=1`]: pageXml([
        { loc: 'https://retsinformation.dk/eli/lta/1999/1' },
        { loc: 'https://retsinformation.dk/eli/lta/2020/2' },
      ]),
    });
    const entries = await collectSitemapEntries({ ...base, fetchText, yearStart: 2000 });
    expect(entries.map((e) => e.id)).toEqual(['2020_2']);
  });

  it('respects maxPages', async () => {
    const fetchText = fakeFetchText({
      [INDEX]: indexXml([`${INDEX}?page=1`, `${INDEX}?page=2`]),
      [`${INDEX}?page=1`]: pageXml([{ loc: 'https://retsinformation.dk/eli/lta/2020/2' }]),
      // page=2 intentionally absent: fetching it would throw
    });
    const entries = await collectSitemapEntries({ ...base, fetchText, maxPages: 1 });
    expect(entries.map((e) => e.id)).toEqual(['2020_2']);
  });
});

describe('extractSitemapLocs', () => {
  it('extracts loc values', () => {
    expect(extractSitemapLocs(indexXml(['https://a', 'https://b']))).toEqual([
      'https://a',
      'https://b',
    ]);
  });
});
