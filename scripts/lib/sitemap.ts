/**
 * Retsinformation sitemap acquisition (PR #90 round 2).
 *
 * Parsing is tolerant: <url> children are matched order-independently and
 * standard optional elements (<changefreq>, <priority>) are allowed — the
 * old regex required the exact sequence loc[,lastmod] and any schema-valid
 * upstream change yielded ZERO entries.
 *
 * Sanity floor: a sitemap that yields zero page URLs or zero document
 * entries FAILS the run (SitemapSanityError). The worklist is a union with
 * held seeds, so a silently-empty sitemap would otherwise degrade the sweep
 * to a seeds-only run that exits 0 and never fetches new law.
 */

import type { SitemapEntry } from './refresh-worklist.js';

export class SitemapSanityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SitemapSanityError';
  }
}

export function extractSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const pattern = /<loc>\s*([^<]+?)\s*<\/loc>/g;

  for (const match of xml.matchAll(pattern)) {
    const url = match[1]?.trim();
    if (url) locs.push(url);
  }

  return locs;
}

export function extractUrlEntries(xml: string): Array<{ loc: string; lastmod?: string }> {
  const entries: Array<{ loc: string; lastmod?: string }> = [];
  const blockPattern = /<url\b[^>]*>([\s\S]*?)<\/url>/g;

  for (const match of xml.matchAll(blockPattern)) {
    const block = match[1];
    const loc = block.match(/<loc>\s*([^<]+?)\s*<\/loc>/)?.[1]?.trim();
    if (!loc) continue;

    entries.push({
      loc,
      lastmod: block.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/)?.[1]?.trim(),
    });
  }

  return entries;
}

export function parseLawIdFromUrl(url: string): { year: number; number: number } | null {
  const match = url.match(/\/eli\/lta\/(\d{4})\/(\d+)$/u);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const number = Number.parseInt(match[2], 10);

  if (!Number.isFinite(year) || !Number.isFinite(number)) {
    return null;
  }

  return { year, number };
}

async function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function collectSitemapEntries(opts: {
  indexUrl: string;
  fetchText: (url: string) => Promise<string>;
  /** Politeness pacing between page fetches (enforced by the CLI). */
  delayMs: number;
  maxPages?: number;
  yearStart?: number;
  yearEnd?: number;
  sleepFn?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}): Promise<SitemapEntry[]> {
  const sleepFn = opts.sleepFn ?? defaultSleep;
  const log = opts.log ?? console.log;

  log('Fetching sitemap index...');
  const indexXml = await opts.fetchText(opts.indexUrl);
  let sitemapPages = extractSitemapLocs(indexXml).filter((url) =>
    /sitemap\.xml\?page=\d+$/u.test(url),
  );

  if (sitemapPages.length === 0) {
    throw new SitemapSanityError(
      `sitemap index ${opts.indexUrl} yielded ZERO page URLs — maintenance page, truncated body, ` +
        'or upstream URL-shape change. Refusing to degrade to a seeds-only run.',
    );
  }

  if (opts.maxPages && opts.maxPages > 0) {
    sitemapPages = sitemapPages.slice(0, opts.maxPages);
  }

  log(`Sitemap pages to scan: ${sitemapPages.length}`);

  const entries = new Map<string, SitemapEntry>();

  for (let i = 0; i < sitemapPages.length; i++) {
    const pageUrl = sitemapPages[i];
    log(`  [${i + 1}/${sitemapPages.length}] ${pageUrl}`);

    await sleepFn(opts.delayMs);
    const pageXml = await opts.fetchText(pageUrl);

    for (const entry of extractUrlEntries(pageXml)) {
      const parsed = parseLawIdFromUrl(entry.loc);
      if (!parsed) continue;

      if (opts.yearStart && parsed.year < opts.yearStart) continue;
      if (opts.yearEnd && parsed.year > opts.yearEnd) continue;

      const id = `${parsed.year}_${parsed.number}`;
      const existing = entries.get(id);
      if (!existing || (entry.lastmod ?? '') > (existing.lastmod ?? '')) {
        entries.set(id, { id, url: entry.loc, lastmod: entry.lastmod ?? null });
      }
    }
  }

  if (entries.size === 0) {
    throw new SitemapSanityError(
      `sitemap pages yielded ZERO /eli/lta document entries (scanned ${sitemapPages.length} pages) — ` +
        'parse failure or upstream shape change. Refusing to degrade to a seeds-only run.' +
        (opts.maxPages
          ? ` NOTE: --max-pages ${opts.maxPages} truncated the scan; on this upstream page 1 is the site-nav page with no documents — try a deeper scan.`
          : ''),
    );
  }

  return [...entries.values()];
}
