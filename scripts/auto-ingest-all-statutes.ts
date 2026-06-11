#!/usr/bin/env tsx
/**
 * Automated bulk ingestion + corpus refresh for Danish laws from
 * Retsinformation (issue #89; hardened in PR #90 round 2).
 *
 * Source flow:
 *   sitemap.xml -> /eli/lta/{year}/{number} URLs (UNION with held seeds)
 *   -> /xml payload -> identity-checked, atomically written, stamped seed
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
 *   - HTTP 404/410 is positive gone-evidence: the held seed is QUARANTINED
 *     to data/seed-gone/ (rename, never delete — it must not keep flowing
 *     into builds as current law), enumerated in the report, exit code
 *     unaffected.
 *   - identity gate: a held seed is refetched ONLY under its own held id —
 *     ingest() refuses (no write) if the URL serves a different document.
 *   - a sitemap yielding zero pages or zero entries FAILS the run instead
 *     of degrading to a seeds-only sweep.
 *   - every failed/gone document is enumerated in the run-stamped JSON
 *     report; a run-start MARKER file is written at startup and a partial
 *     report is written on SIGINT/SIGTERM, so an interrupted run's
 *     --skip-stamped-since cutoff is always recoverable.
 *
 * Politeness: >= 2s start-to-start pacing against retsinformation.dk
 * INCLUDING retries; one request in flight at a time. Enforced for
 * --dry-run too (dry runs still fetch live sitemap pages).
 *
 * Usage:
 *   node --import tsx scripts/auto-ingest-all-statutes.ts
 *   node --import tsx scripts/auto-ingest-all-statutes.ts --refresh
 *   node --import tsx scripts/auto-ingest-all-statutes.ts --refresh \
 *     --skip-stamped-since 2026-06-11T00:00:00Z   # resume interrupted run
 *   node --import tsx scripts/auto-ingest-all-statutes.ts --limit 500 --dry-run
 *
 * Exit codes: 0 = complete; 1 = fatal; 2 = partial (failures enumerated);
 * 130/143 = interrupted (SIGINT/SIGTERM, partial report written).
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { ingest, GoneUpstreamError } from './ingest-retsinformation.js';
import { decideFetch, type SeedIngestMeta } from './lib/refresh-policy.js';
import {
  applyLimit,
  buildWorklist,
  quarantineGoneSeed,
  readHeldSeedId,
  summarizeRun,
  type WorkItem,
  type RunStats,
} from './lib/refresh-worklist.js';
import { fetchWithRetry } from './lib/http-retry.js';
import { parseRefreshArgs, REQUEST_DELAY_MS, type CLIOptions } from './lib/refresh-cli.js';
import { collectSitemapEntries } from './lib/sitemap.js';
import {
  buildReportPath,
  makeInterruptHandler,
  writeReport,
  writeRunMarker,
} from './lib/run-report.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITEMAP_INDEX_URL = 'https://www.retsinformation.dk/sitemap.xml';
const OUTPUT_DIR = path.resolve(__dirname, '../data/seed');
const QUARANTINE_DIR = path.resolve(__dirname, '../data/seed-gone');
const REPORT_DIR = path.resolve(__dirname, '../reports');
const USER_AGENT = 'Danish-Law-MCP/1.0.0 (bulk-ingest)';

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithRetry(url, {
    minDelayMs: REQUEST_DELAY_MS,
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

function readSeedMeta(seedPath: string): SeedIngestMeta | null {
  try {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as { _ingest?: SeedIngestMeta };
    return seed._ingest ?? null;
  } catch {
    // Unreadable seed == unstamped seed: it self-heals via refetch_unknown.
    return null;
  }
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

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export interface DecidedItem extends WorkItem {
  decision: ReturnType<typeof decideFetch>;
}

export interface ProcessDeps {
  ingestFn?: typeof ingest;
  seedDir?: string;
  quarantineDir?: string;
  sleepFn?: (ms: number) => Promise<void>;
}

export async function processWorklist(
  work: DecidedItem[],
  options: Pick<CLIOptions, 'dryRun' | 'delayMs'>,
  stats: RunStats,
  deps: ProcessDeps = {},
): Promise<void> {
  const ingestFn = deps.ingestFn ?? ingest;
  const seedDir = deps.seedDir ?? OUTPUT_DIR;
  const quarantineDir = deps.quarantineDir ?? QUARANTINE_DIR;
  const sleepFn = deps.sleepFn ?? sleep;

  stats.total = work.length;
  fs.mkdirSync(seedDir, { recursive: true });

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

    const outputPath = path.join(seedDir, `${item.id}.json`);

    // Identity gate expectation: the identity we ALREADY SERVE (the held
    // seed's id) — never a re-derived format. Pre-1901 statutes legitimately
    // carry DocumentId-fallback ids (AL000501, CM016392, ...): those are the
    // prod-stable citation identity and must keep matching. A never-held or
    // unreadable seed has no held identity: the served id IS the identity.
    const heldId = item.seedExists ? readHeldSeedId(outputPath) : null;
    // No held identity (fetch_new / torn seed): the URL-derived year:number
    // is a shape-conditional expectation — enforced inside ingest() whenever
    // the served id is year:number-shaped, so a redirect to a different
    // modern document can never land under this item's filename (round 3).
    const gateOpts =
      heldId !== null ? { expectedId: heldId } : { urlDerivedId: item.id.replace('_', ':') };

    await sleepFn(options.delayMs);
    try {
      let result;
      try {
        result = await ingestFn(item.xmlUrl, outputPath, gateOpts);
      } catch (error) {
        // Quarantine removes law from the served corpus — that demands
        // removal-grade evidence, not one unretried 404 (round 3):
        //  - the sitemap LISTING the document contradicts "gone" outright;
        //  - otherwise a single 404 gets one confirming probe after the
        //    politeness delay; only a second 404 is gone-evidence.
        if (error instanceof GoneUpstreamError && item.inSitemap) {
          throw new Error(
            `HTTP ${error.httpStatus} but the sitemap lists this document — contradictory evidence, treating as failure, seed kept`,
          );
        }
        if (error instanceof GoneUpstreamError) {
          await sleepFn(options.delayMs);
          result = await ingestFn(item.xmlUrl, outputPath, gateOpts);
        } else {
          throw error;
        }
      }
      console.log(`${tag} OK ${item.decision} status=${result.status}`);
      stats.fetched += 1;
    } catch (error) {
      if (error instanceof GoneUpstreamError) {
        const quarantinedPath = quarantineGoneSeed(outputPath, quarantineDir);
        stats.goneUpstream.push({
          id: item.id,
          httpStatus: error.httpStatus,
          quarantined: quarantinedPath !== null,
        });
        console.error(
          `${tag} GONE upstream (HTTP ${error.httpStatus}, confirmed by second probe)${
            quarantinedPath !== null
              ? ` — seed quarantined to ${path.relative(path.dirname(seedDir), quarantinedPath)}`
              : ' — no held seed'
          }`,
        );
        continue;
      }
      // IdentityMismatchError lands here too: ingest() refused BEFORE any
      // write, the held seed is untouched, and the message says exactly
      // which document the URL served.
      const message = error instanceof Error ? error.message : String(error);
      stats.failed.push({ id: item.id, error: message });
      console.error(`${tag} FAIL ${message}`);
    }
  }
}

async function run(): Promise<void> {
  const options = parseRefreshArgs(process.argv.slice(2));
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

  const reportPath = buildReportPath(REPORT_DIR, runStartedAt, options.reportPath);

  // Durable run-start marker: if this run dies without a report, the exact
  // resume cutoff is recovered from here, not from a maybe-redirected stdout.
  const markerPath = writeRunMarker(REPORT_DIR, {
    run_started_at: runStartedAt,
    mode: options.refresh ? 'refresh' : 'additive',
    skip_stamped_since: options.skipStampedSince ?? null,
    report_path: reportPath,
    resume_command: `--refresh --skip-stamped-since ${runStartedAt}`,
  });
  console.log(`Run marker written: ${markerPath}`);

  const stats: RunStats = { total: 0, fetched: 0, skipped: 0, failed: [], goneUpstream: [] };
  let byDecision = new Map<string, number>();

  const buildPayload = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    run_started_at: runStartedAt,
    finished_at: new Date().toISOString(),
    mode: options.refresh ? 'refresh' : 'additive',
    options: { ...options },
    decisions: Object.fromEntries(byDecision),
    stats,
    ...extra,
  });

  const onInterrupt = makeInterruptHandler({ reportPath, payload: () => buildPayload() });
  process.once('SIGINT', () => onInterrupt('SIGINT'));
  process.once('SIGTERM', () => onInterrupt('SIGTERM'));

  const sitemapEntries = await collectSitemapEntries({
    indexUrl: SITEMAP_INDEX_URL,
    fetchText,
    delayMs: options.delayMs,
    maxPages: options.maxPages,
    yearStart: options.yearStart,
    yearEnd: options.yearEnd,
  });
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
      existingMeta: item.seedExists ? readSeedMeta(path.join(OUTPUT_DIR, `${item.id}.json`)) : null,
      skipStampedSince: options.skipStampedSince ?? null,
      today,
    }),
  }));

  // Deterministic order: new documents (fetch_new) first — they are current
  // law missing from the corpus, the most dangerous gap — then by id so an
  // interrupted run + --skip-stamped-since resume converges.
  const rank = (d: DecidedItem): number => (d.decision === 'fetch_new' ? 0 : 1);
  decided.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));

  // --limit budgets only items that actually fetch: skips pass through free
  // so chunked resumes advance instead of reprocessing the stamped prefix.
  const queue = applyLimit(decided, options.limit);

  byDecision = new Map<string, number>();
  for (const item of queue) {
    byDecision.set(item.decision, (byDecision.get(item.decision) ?? 0) + 1);
  }
  console.log(`Worklist: ${queue.length} documents — ${[...byDecision.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}\n`);

  await processWorklist(queue, options, stats);
  const summary = summarizeRun(stats);

  console.log('\n' + '='.repeat(72));
  console.log('DANISH BULK INGEST SUMMARY');
  console.log('='.repeat(72));
  for (const line of summary.lines) console.log(line);
  console.log('='.repeat(72));

  writeReport(reportPath, buildPayload({ exit_code: summary.exitCode }));
  console.log(`Report written: ${reportPath}`);

  if (!options.dryRun && stats.fetched > 0) {
    console.log('\nNext step: npm run build:db');
  }

  process.exit(summary.exitCode);
}

const isDirectRun = (() => {
  const scriptArg = process.argv[1];
  if (!scriptArg) return false;
  return pathToFileURL(path.resolve(scriptArg)).href === import.meta.url;
})();

if (isDirectRun) {
  run().catch(error => {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
