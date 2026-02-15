#!/usr/bin/env tsx
/**
 * Automated bulk ingestion of Danish laws from Retsinformation sitemap.
 *
 * Source flow:
 *   sitemap.xml -> /eli/lta/{year}/{number} URLs -> /xml payload -> seed JSON
 *
 * Usage:
 *   node --import tsx scripts/auto-ingest-all-statutes.ts
 *   node --import tsx scripts/auto-ingest-all-statutes.ts --limit 500
 *   node --import tsx scripts/auto-ingest-all-statutes.ts --year-start 2015 --year-end 2026
 *   node --import tsx scripts/auto-ingest-all-statutes.ts --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ingest } from './ingest-retsinformation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITEMAP_INDEX_URL = 'https://www.retsinformation.dk/sitemap.xml';
const OUTPUT_DIR = path.resolve(__dirname, '../data/seed');
const REQUEST_DELAY_MS = 350;
const USER_AGENT = 'Danish-Law-MCP/1.0.0 (bulk-ingest)';

interface CLIOptions {
  limit?: number;
  yearStart?: number;
  yearEnd?: number;
  dryRun: boolean;
  skipExisting: boolean;
  maxPages?: number;
  delayMs: number;
}

interface LawEntry {
  url: string;
  year: number;
  number: number;
  lastmod?: string;
}

interface IngestionStats {
  total: number;
  skipped: number;
  succeeded: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    dryRun: false,
    skipExisting: true,
    delayMs: REQUEST_DELAY_MS,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--limit':
        options.limit = Number.parseInt(args[++i], 10);
        break;
      case '--year-start':
        options.yearStart = Number.parseInt(args[++i], 10);
        break;
      case '--year-end':
        options.yearEnd = Number.parseInt(args[++i], 10);
        break;
      case '--max-pages':
        options.maxPages = Number.parseInt(args[++i], 10);
        break;
      case '--delay-ms':
        options.delayMs = Number.parseInt(args[++i], 10);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--no-skip':
        options.skipExisting = false;
        break;
      default:
        break;
    }
  }

  return options;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/xml,text/xml,*/*',
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

function extractSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  const pattern = /<loc>([^<]+)<\/loc>/g;

  for (const match of xml.matchAll(pattern)) {
    const url = match[1]?.trim();
    if (url) locs.push(url);
  }

  return locs;
}

function extractUrlEntries(xml: string): Array<{ loc: string; lastmod?: string }> {
  const entries: Array<{ loc: string; lastmod?: string }> = [];
  const pattern = /<url>\s*<loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g;

  for (const match of xml.matchAll(pattern)) {
    const loc = match[1]?.trim();
    if (!loc) continue;

    entries.push({
      loc,
      lastmod: match[2]?.trim(),
    });
  }

  return entries;
}

function isLtaUrl(url: string): boolean {
  return /\/eli\/lta\/\d{4}\/\d+$/u.test(url);
}

function parseLawIdFromUrl(url: string): { year: number; number: number } | null {
  const match = url.match(/\/eli\/lta\/(\d{4})\/(\d+)$/u);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const number = Number.parseInt(match[2], 10);

  if (!Number.isFinite(year) || !Number.isFinite(number)) {
    return null;
  }

  return { year, number };
}

function compareByLastmodDesc(a: LawEntry, b: LawEntry): number {
  const aDate = a.lastmod ? Date.parse(a.lastmod) : 0;
  const bDate = b.lastmod ? Date.parse(b.lastmod) : 0;

  if (aDate !== bDate) return bDate - aDate;
  if (a.year !== b.year) return b.year - a.year;
  return b.number - a.number;
}

async function collectLawEntries(options: CLIOptions): Promise<LawEntry[]> {
  console.log('Fetching sitemap index...');
  const indexXml = await fetchText(SITEMAP_INDEX_URL);
  let sitemapPages = extractSitemapLocs(indexXml).filter(url => /sitemap\.xml\?page=\d+$/u.test(url));

  if (options.maxPages && options.maxPages > 0) {
    sitemapPages = sitemapPages.slice(0, options.maxPages);
  }

  console.log(`Sitemap pages to scan: ${sitemapPages.length}`);

  const lawMap = new Map<string, LawEntry>();

  for (let i = 0; i < sitemapPages.length; i++) {
    const pageUrl = sitemapPages[i];
    console.log(`  [${i + 1}/${sitemapPages.length}] ${pageUrl}`);

    const pageXml = await fetchText(pageUrl);
    const entries = extractUrlEntries(pageXml);

    for (const entry of entries) {
      if (!isLtaUrl(entry.loc)) continue;

      const parsed = parseLawIdFromUrl(entry.loc);
      if (!parsed) continue;

      if (options.yearStart && parsed.year < options.yearStart) continue;
      if (options.yearEnd && parsed.year > options.yearEnd) continue;

      const existing = lawMap.get(entry.loc);
      if (!existing || ((entry.lastmod ?? '') > (existing.lastmod ?? ''))) {
        lawMap.set(entry.loc, {
          url: entry.loc,
          year: parsed.year,
          number: parsed.number,
          lastmod: entry.lastmod,
        });
      }
    }

    await sleep(200);
  }

  const laws = [...lawMap.values()].sort(compareByLastmodDesc);

  if (options.limit && options.limit > 0) {
    return laws.slice(0, options.limit);
  }

  return laws;
}

function getExistingSeedIds(): Set<string> {
  const existing = new Set<string>();

  if (!fs.existsSync(OUTPUT_DIR)) {
    return existing;
  }

  for (const file of fs.readdirSync(OUTPUT_DIR)) {
    const match = file.match(/^(\d{4})_(\d+)\.json$/u);
    if (!match) continue;

    const year = match[1];
    const number = Number.parseInt(match[2], 10);
    if (Number.isFinite(number) && number > 0) {
      existing.add(`${year}:${number}`);
    }
  }

  return existing;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ingestBatch(
  laws: LawEntry[],
  options: CLIOptions,
  existingIds: Set<string>,
): Promise<IngestionStats> {
  const stats: IngestionStats = {
    total: laws.length,
    skipped: 0,
    succeeded: 0,
    failed: 0,
    errors: [],
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (let i = 0; i < laws.length; i++) {
    const law = laws[i];
    const id = `${law.year}:${law.number}`;

    if (options.skipExisting && existingIds.has(id)) {
      console.log(`[${i + 1}/${laws.length}] SKIP ${id} (seed exists)`);
      stats.skipped++;
      continue;
    }

    const outputPath = path.join(OUTPUT_DIR, `${law.year}_${law.number}.json`);
    const xmlUrl = `${law.url}/xml`;

    if (options.dryRun) {
      console.log(`[${i + 1}/${laws.length}] DRY RUN ${id} <- ${xmlUrl}`);
      stats.succeeded++;
      continue;
    }

    try {
      await ingest(xmlUrl, outputPath);
      console.log(`[${i + 1}/${laws.length}] OK ${id}`);
      stats.succeeded++;
      existingIds.add(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${i + 1}/${laws.length}] FAIL ${id}: ${message}`);
      stats.failed++;
      stats.errors.push({ id, error: message });
    }

    if (options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  return stats;
}

function printSummary(stats: IngestionStats, options: CLIOptions): void {
  console.log('\n' + '='.repeat(72));
  console.log('DANISH BULK INGEST SUMMARY');
  console.log('='.repeat(72));
  console.log(`Total candidates:        ${stats.total}`);
  console.log(`Skipped existing:        ${stats.skipped}`);
  console.log(`Ingested successfully:   ${stats.succeeded}`);
  console.log(`Failed:                  ${stats.failed}`);
  console.log(`Dry run:                 ${options.dryRun ? 'YES' : 'NO'}`);
  console.log('='.repeat(72));

  if (stats.errors.length > 0) {
    console.log('\nFailed items (first 50):');
    for (const { id, error } of stats.errors.slice(0, 50)) {
      console.log(`  - ${id}: ${error}`);
    }
  }
}

async function run(): Promise<void> {
  const options = parseArgs();

  console.log('Automated Danish Law Ingestion');
  console.log('===============================\n');
  console.log(`Year range: ${options.yearStart ?? 'all'} -> ${options.yearEnd ?? 'all'}`);
  console.log(`Limit: ${options.limit ?? 'none'}`);
  console.log(`Max pages: ${options.maxPages ?? 'all'}`);
  console.log(`Skip existing: ${options.skipExisting ? 'YES' : 'NO'}`);
  console.log(`Dry run: ${options.dryRun ? 'YES' : 'NO'}`);
  console.log(`Delay per request: ${options.delayMs} ms\n`);

  const laws = await collectLawEntries(options);
  console.log(`\nLaw URLs selected: ${laws.length}`);

  const existing = getExistingSeedIds();
  console.log(`Existing statute seed files: ${existing.size}\n`);

  const stats = await ingestBatch(laws, options, existing);
  printSummary(stats, options);

  if (!options.dryRun && stats.succeeded > 0) {
    console.log('\nNext step: npm run build:db');
  }
}

run().catch(error => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
