/**
 * Refresh worklist construction + fail-loud run summary (issue #89).
 *
 * The worklist is the UNION of today's sitemap documents and the seeds we
 * already hold: 656 held seeds are absent from the 2026-06-10 sitemap and a
 * sitemap-only iteration would silently never revisit them. Absence from the
 * sitemap is NOT gone-evidence — only a 404/410 on the document URL is.
 */

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

export interface RunStats {
  total: number;
  fetched: number;
  skipped: number;
  failed: Array<{ id: string; error: string }>;
  goneUpstream: Array<{ id: string; httpStatus: number }>;
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
    lines.push(`GONE UPSTREAM (positive 404/410 evidence; seeds kept, review required):`);
    for (const g of stats.goneUpstream) {
      lines.push(`  gone ${g.id} (HTTP ${g.httpStatus})`);
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
