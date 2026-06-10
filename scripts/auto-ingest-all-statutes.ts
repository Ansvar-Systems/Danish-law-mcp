#!/usr/bin/env tsx
/**
 * Automated bulk ingestion + corpus refresh for Danish laws from
 * Retsinformation (issue #89).
 *
 * Source flow:
 *   sitemap.xml -> /eli/lta/{year}/{number} URLs (UNION with held seeds)
 *   -> /xml payload -> stamped seed JSON
 *
 * Modes:
 *   default      additive: only documents without a seed are fetched
 *   --refresh    version-keyed refresh: unstamped seeds self-heal
 *                unconditionally; stamped seeds refetch unless proven
 *                current (see scripts/lib/refresh-policy.ts)
 *
 * Fail-loud contract:
 *   - transient fetch failures retry with backoff, then count as FAILED —
 *     never as "document gone"; the run continues and exits 2 at the end.
 *   - HTTP 404/410 is positive gone-evidence: enumerated in the report,
 *     seed kept, exit code unaffected.
 *   - every failed/gone document is enumerated in the JSON report.
 *
 * Politeness: >= 2s start-to-start pacing against retsinformation.dk; one
 * request in flight at a time.
 *
 * Usage:
 *   node --import tsx scripts/auto-ingest-all-statutes.ts
 *   node --import tsx scripts/auto-ingest-all-statutes.ts --refresh
 *   node --import tsx scripts/auto-ingest-all-statutes.ts --refresh \
 *     --skip-stamped-since 2026-06-11T00:00:00Z   # resume interrupted run
 *   node --import tsx scripts/auto-ingest-all-statutes.ts --limit 500 --dry-run
 *
 * Exit codes: 0 = complete; 1 = fatal; 2 = partial (failures enumerated).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ingest, GoneUpstreamError } from './ingest-retsinformation.js';
import { decideFetch, type SeedIngestMeta } from './lib/refresh-policy.js';
import { buildWorklist, summarizeRun, type SitemapEntry, type WorkItem, type RunStats } from './lib/refresh-worklist.js';
import { fetchWithRetry } from './lib/http-retry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITEMAP_INDEX_URL = 'https://www.retsinformation.dk/sitemap.xml';
const OUTPUT_DIR = path.resolve(__dirname, '../data/seed');
const REPORT_DIR = path.resolve(__dirname, '../reports');
/** Politeness floor for retsinformation.dk: 2s start-to-start, sequential. */
const REQUEST_DELAY_MS = 2_000;
const USER_AGENT = 'Danish-Law-MCP/1.0.0 (bulk-ingest)';

interface CLIOptions {
  limit?: number;
  yearStart?: number;
  yearEnd?: number;
  dryRun: boolean;
  refresh: boolean;
  skipStampedSince?: string;
  maxPages?: number;
  delayMs: number;
  reportPath?: string;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    dryRun: false,
    refresh: false,
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
      case '--refresh':
        options.refresh = true;
        break;
      case '--skip-stamped-since':
        options.skipStampedSince = args[++i];
        break;
      case '--report':
        options.reportPath = args[++i];
        break;
      case '--no-skip':
        // Legacy alias: a full refetch regardless of stamps is --refresh
        // without --skip-stamped-since.
        options.refresh = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.delayMs < REQUEST_DELAY_MS && !options.dryRun) {
    throw new Error(
      `--delay-ms ${options.delayMs} is below the ${REQUEST_DELAY_MS}ms politeness floor for retsinformation.dk`,
    );
  }

  return options;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithRetry(url, {
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
  const pattern = /<url>\s*<loc>([^<]+)<\/loc>\s*(?:<lastmod>([^<]+)<\/lastmod>)?\s*<\/url>/g;

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

async function collectSitemapEntries(options: CLIOptions): Promise<SitemapEntry[]> {
  console.log('Fetching sitemap index...');
  const indexXml = await fetchText(SITEMAP_INDEX_URL);
  let sitemapPages = extractSitemapLocs(indexXml).filter(url => /sitemap\.xml\?page=\d+$/u.test(url));

  if (options.maxPages && options.maxPages > 0) {
    sitemapPages = sitemapPages.slice(0, options.maxPages);
  }

  console.log(`Sitemap pages to scan: ${sitemapPages.length}`);

  const entries = new Map<string, SitemapEntry>();

  for (let i = 0; i < sitemapPages.length; i++) {
    const pageUrl = sitemapPages[i];
    console.log(`  [${i + 1}/${sitemapPages.length}] ${pageUrl}`);

    await sleep(options.delayMs);
    const pageXml = await fetchText(pageUrl);

    for (const entry of extractUrlEntries(pageXml)) {
      const parsed = parseLawIdFromUrl(entry.loc);
      if (!parsed) continue;

      if (options.yearStart && parsed.year < options.yearStart) continue;
      if (options.yearEnd && parsed.year > options.yearEnd) continue;

      const id = `${parsed.year}_${parsed.number}`;
      const existing = entries.get(id);
      if (!existing || ((entry.lastmod ?? '') > (existing.lastmod ?? ''))) {
        entries.set(id, { id, url: entry.loc, lastmod: entry.lastmod ?? null });
      }
    }
  }

  return [...entries.values()];
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
      existing.add(`${year}_${number}`);
    }
  }

  return existing;
}

function readSeedMeta(id: string): SeedIngestMeta | null {
  const seedPath = path.join(OUTPUT_DIR, `${id}.json`);
  try {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as { _ingest?: SeedIngestMeta };
    return seed._ingest ?? null;
  } catch {
    // Unreadable seed == unstamped seed: it self-heals via refetch_unknown.
    return null;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface DecidedItem extends WorkItem {
  decision: ReturnType<typeof decideFetch>;
}

async function processWorklist(
  work: DecidedItem[],
  options: CLIOptions,
): Promise<RunStats> {
  const stats: RunStats = {
    total: work.length,
    fetched: 0,
    skipped: 0,
    failed: [],
    goneUpstream: [],
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (let i = 0; i < work.length; i++) {
    const item = work[i];
    const tag = `[${i + 1}/${work.length}] ${item.id}`;

    if (item.decision === 'skip_existing' || item.decision === 'skip_current') {
      stats.skipped += 1;
      continue;
    }

    if (options.dryRun) {
      console.log(`${tag} DRY RUN ${item.decision} <- ${item.xmlUrl}`);
      stats.fetched += 1;
      continue;
    }

    const outputPath = path.join(OUTPUT_DIR, `${item.id}.json`);

    await sleep(options.delayMs);
    try {
      const result = await ingest(item.xmlUrl, outputPath);
      const expectedId = item.id.replace('_', ':');
      if (result.seedId !== expectedId) {
        // The URL served a document with a different identity than the URL
        // claims — record loudly instead of leaving the held seed stale.
        stats.failed.push({
          id: item.id,
          error: `identity mismatch: URL ${item.xmlUrl} served document ${result.seedId}`,
        });
        console.error(`${tag} FAIL identity mismatch: served ${result.seedId}`);
        continue;
      }
      console.log(`${tag} OK ${item.decision} status=${result.status}`);
      stats.fetched += 1;
    } catch (error) {
      if (error instanceof GoneUpstreamError) {
        stats.goneUpstream.push({ id: item.id, httpStatus: error.httpStatus });
        console.error(`${tag} GONE upstream (HTTP ${error.httpStatus}) — seed kept`);
        continue;
      }
      const message = error instanceof Error ? error.message : String(error);
      stats.failed.push({ id: item.id, error: message });
      console.error(`${tag} FAIL ${message}`);
    }
  }

  return stats;
}

async function run(): Promise<void> {
  const options = parseArgs();
  const runStartedAt = new Date().toISOString();
  const today = runStartedAt.slice(0, 10);

  console.log('Automated Danish Law Ingestion');
  console.log('===============================\n');
  console.log(`Run started: ${runStartedAt}`);
  console.log(`Mode: ${options.refresh ? 'REFRESH (version-keyed)' : 'additive'}`);
  console.log(`Year range: ${options.yearStart ?? 'all'} -> ${options.yearEnd ?? 'all'}`);
  console.log(`Limit: ${options.limit ?? 'none'}`);
  console.log(`Skip stamped since: ${options.skipStampedSince ?? 'n/a'}`);
  console.log(`Dry run: ${options.dryRun ? 'YES' : 'NO'}`);
  console.log(`Delay per request: ${options.delayMs} ms\n`);

  const sitemapEntries = await collectSitemapEntries(options);
  console.log(`\nSitemap documents: ${sitemapEntries.length}`);

  const existingIds = getExistingSeedIds();
  console.log(`Existing statute seed files: ${existingIds.size}`);

  let worklist = buildWorklist({ sitemapEntries, existingSeedIds: existingIds });

  if (options.yearStart || options.yearEnd) {
    worklist = worklist.filter(item => {
      const year = Number.parseInt(item.id.slice(0, 4), 10);
      if (options.yearStart && year < options.yearStart) return false;
      if (options.yearEnd && year > options.yearEnd) return false;
      return true;
    });
  }

  const decided: DecidedItem[] = worklist.map(item => ({
    ...item,
    decision: decideFetch({
      seedExists: item.seedExists,
      refresh: options.refresh,
      existingMeta: item.seedExists ? readSeedMeta(item.id) : null,
      skipStampedSince: options.skipStampedSince ?? null,
      today,
    }),
  }));

  // Deterministic order: new documents (fetch_new) first — they are current
  // law missing from the corpus, the most dangerous gap — then by id so an
  // interrupted run + --skip-stamped-since resume converges.
  const rank = (d: DecidedItem): number => (d.decision === 'fetch_new' ? 0 : 1);
  decided.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));

  let queue = decided;
  if (options.limit && options.limit > 0) {
    queue = decided.slice(0, options.limit);
  }

  const byDecision = new Map<string, number>();
  for (const item of queue) {
    byDecision.set(item.decision, (byDecision.get(item.decision) ?? 0) + 1);
  }
  console.log(`Worklist: ${queue.length} documents — ${[...byDecision.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}\n`);

  const stats = await processWorklist(queue, options);
  const summary = summarizeRun(stats);

  console.log('\n' + '='.repeat(72));
  console.log('DANISH BULK INGEST SUMMARY');
  console.log('='.repeat(72));
  for (const line of summary.lines) console.log(line);
  console.log('='.repeat(72));

  const reportPath = options.reportPath
    ?? path.join(REPORT_DIR, `ingest-refresh-${runStartedAt.slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        run_started_at: runStartedAt,
        finished_at: new Date().toISOString(),
        mode: options.refresh ? 'refresh' : 'additive',
        options: { ...options },
        decisions: Object.fromEntries(byDecision),
        stats,
        exit_code: summary.exitCode,
      },
      null,
      2,
    )}\n`,
    'utf-8',
  );
  console.log(`Report written: ${reportPath}`);

  if (!options.dryRun && stats.fetched > 0) {
    console.log('\nNext step: npm run build:db');
  }

  process.exit(summary.exitCode);
}

run().catch(error => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
