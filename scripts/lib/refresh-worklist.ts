/**
 * Refresh worklist construction + fail-loud run summary (issue #89).
 *
 * The worklist is the UNION of today's sitemap documents and the seeds we
 * already hold: 656 held seeds are absent from the 2026-06-10 sitemap and a
 * sitemap-only iteration would silently never revisit them. Absence from the
 * sitemap is NOT gone-evidence — only a 404/410 on the document URL is.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SitemapEntry {
  /** Canonical 'YYYY_N' id. */
  id: string;
  /** Document page URL as listed in the sitemap. */
  url: string;
  lastmod: string | null;
}

export interface WorkItem {
  id: string;
  /** XML payload URL on the canonical https://www.retsinformation.dk host. */
  xmlUrl: string;
  lastmod: string | null;
  seedExists: boolean;
  inSitemap: boolean;
}

function xmlUrlForId(id: string): string {
  const [year, number] = id.split('_');
  return `https://www.retsinformation.dk/eli/lta/${year}/${Number(number)}/xml`;
}

export function buildWorklist(opts: {
  sitemapEntries: SitemapEntry[];
  existingSeedIds: Iterable<string>;
}): WorkItem[] {
  const seeds = new Set(opts.existingSeedIds);
  const out = new Map<string, WorkItem>();

  for (const entry of opts.sitemapEntries) {
    out.set(entry.id, {
      id: entry.id,
      xmlUrl: xmlUrlForId(entry.id),
      lastmod: entry.lastmod ?? null,
      seedExists: seeds.has(entry.id),
      inSitemap: true,
    });
  }

  for (const id of seeds) {
    if (out.has(id)) continue;
    out.set(id, {
      id,
      xmlUrl: xmlUrlForId(id),
      lastmod: null,
      seedExists: true,
      inSitemap: false,
    });
  }

  return [...out.values()];
}

/**
 * The identity we ALREADY SERVE under a seed path — the seed file's `id`.
 * This is what the identity gate compares the served document against, never
 * a re-derived format: pre-1901 statutes legitimately carry DocumentId
 * fallback ids (AL000501, CM016392, ...) which are the prod-stable citation
 * identity. Missing/torn/id-less seeds have no held identity (null): the
 * refetched document's served id becomes the identity, which is exactly the
 * documented self-heal path for unreadable seeds.
 */
export function readHeldSeedId(seedPath: string): string | null {
  try {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as { id?: unknown };
    return typeof seed.id === 'string' && seed.id.trim().length > 0 ? seed.id : null;
  } catch {
    return null;
  }
}

/**
 * Quarantine a gone-upstream seed (PR #90 round 2, Dutch-law-mcp 976c0ef):
 * a gone document's seed must not keep flowing into builds as current law.
 * Rename — never delete — so the operator can audit/restore and the corpus
 * differ surfaces the removal at swap time. Returns the quarantine path, or
 * null when there was no held seed.
 */
export function quarantineGoneSeed(seedPath: string, quarantineDir: string): string | null {
  if (!fs.existsSync(seedPath)) return null;
  fs.mkdirSync(quarantineDir, { recursive: true });
  const destPath = path.join(quarantineDir, path.basename(seedPath));
  fs.renameSync(seedPath, destPath);
  return destPath;
}

/**
 * Apply --limit so the budget counts only items that actually FETCH. Skip
 * decisions pass through free: a fully-stamped prefix must not starve the
 * budget, otherwise every chunked `--limit N` resume reprocesses the same
 * already-done window, reports fetched=0, exits 0 and the sweep never
 * advances.
 */
export function applyLimit<T extends { decision: string }>(decided: T[], limit?: number): T[] {
  if (!limit || !Number.isFinite(limit) || limit <= 0) return decided;

  const queue: T[] = [];
  let budget = 0;

  for (const item of decided) {
    if (item.decision === 'skip_existing' || item.decision === 'skip_current') {
      queue.push(item);
      continue;
    }
    if (budget === limit) break;
    queue.push(item);
    budget += 1;
  }

  return queue;
}

export interface RunStats {
  total: number;
  fetched: number;
  skipped: number;
  failed: Array<{ id: string; error: string }>;
  goneUpstream: Array<{ id: string; httpStatus: number; quarantined: boolean }>;
}

export interface RunSummary {
  exitCode: 0 | 2;
  lines: string[];
}

/**
 * Fail-loud summary: any failure makes the run exit non-zero (2) so an
 * unattended sweep can never look complete when it was not. Gone-upstream
 * findings (positive 404/410 evidence) are enumerated but are not failures —
 * the seed is kept and the operator decides.
 */
export function summarizeRun(stats: RunStats): RunSummary {
  const lines: string[] = [];
  lines.push(`total=${stats.total} fetched=${stats.fetched} skipped=${stats.skipped} failed=${stats.failed.length} gone_upstream=${stats.goneUpstream.length}`);

  if (stats.goneUpstream.length > 0) {
    lines.push(`GONE UPSTREAM (positive 404/410 evidence; held seeds quarantined to data/seed-gone/, review required):`);
    for (const g of stats.goneUpstream) {
      lines.push(
        `  gone ${g.id} (HTTP ${g.httpStatus}) — ${g.quarantined ? 'seed quarantined to data/seed-gone/' : 'no held seed'}`,
      );
    }
  }

  if (stats.failed.length > 0) {
    lines.push(`FAILED (transient or unmapped — NOT gone; rerun with --refresh --skip-stamped-since <run-start>):`);
    for (const f of stats.failed) {
      lines.push(`  failed ${f.id}: ${f.error}`);
    }
  }

  return { exitCode: stats.failed.length > 0 ? 2 : 0, lines };
}
