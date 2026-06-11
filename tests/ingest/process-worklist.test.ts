/**
 * Bulk-runner orchestration (PR #90 round 2).
 *
 * Three review findings live at this seam:
 *  1. Identity gate ordering: the expectation passed to ingest() must be the
 *     HELD seed's id (the identity we already serve), never a re-derived
 *     year:number format — 77 pre-1901 statutes legitimately serve
 *     DocumentId-fallback ids (CM016392, AL000501, ...) that are the
 *     prod-stable citation identity.
 *  2. Gone upstream (404/410) quarantines the held seed to data/seed-gone/
 *     (rename, never delete, never keep serving) — a pre-fix unstamped seed
 *     that 404s can never self-heal any other way.
 *  3. Identity mismatches are recorded as failures WITHOUT touching the held
 *     seed (refusal happens inside ingest(), before any write).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { processWorklist, type DecidedItem } from '../../scripts/auto-ingest-all-statutes.js';
import {
  GoneUpstreamError,
  IdentityMismatchError,
  type IngestOptions,
  type IngestResult,
} from '../../scripts/ingest-retsinformation.js';
import type { RunStats } from '../../scripts/lib/refresh-worklist.js';

function tmpDirs(): { seedDir: string; quarantineDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-worklist-test-'));
  return { seedDir: path.join(root, 'seed'), quarantineDir: path.join(root, 'seed-gone') };
}

function newStats(): RunStats {
  return { total: 0, fetched: 0, skipped: 0, failed: [], goneUpstream: [] };
}

function item(id: string, decision: DecidedItem['decision'], seedExists: boolean): DecidedItem {
  const [year, number] = id.split('_');
  return {
    id,
    xmlUrl: `https://www.retsinformation.dk/eli/lta/${year}/${Number(number)}/xml`,
    lastmod: null,
    seedExists,
    inSitemap: true,
    decision,
  };
}

function writeSeed(seedDir: string, id: string, body: object): string {
  fs.mkdirSync(seedDir, { recursive: true });
  const p = path.join(seedDir, `${id}.json`);
  fs.writeFileSync(p, `${JSON.stringify(body, null, 2)}\n`, 'utf-8');
  return p;
}

const OPTS = { dryRun: false, delayMs: 0 };
const noSleep = async (): Promise<void> => {};

/** Fake ingest that mimics the real expectedId refusal contract. */
function fakeIngest(servedId: string, writes: Array<{ outputPath?: string; opts?: IngestOptions }>) {
  return async (
    _identifier: string,
    outputPath?: string,
    opts: IngestOptions = {},
  ): Promise<IngestResult> => {
    if (opts.expectedId !== undefined && servedId !== opts.expectedId) {
      throw new IdentityMismatchError('https://x/xml', servedId, opts.expectedId);
    }
    writes.push({ outputPath, opts });
    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify({ id: servedId }), 'utf-8');
    }
    return {
      seedId: servedId,
      outputPath: outputPath ?? '',
      status: 'in_force',
      identity: {
        accession: null,
        document_id: null,
        unique_document_id: null,
        upstream_status: 'Valid',
        start_date: null,
        end_date: null,
        historic_marked: null,
      },
    };
  };
}

describe('processWorklist identity gate', () => {
  it('passes the HELD seed id as expectedId — pre-1901 fallback ids are the prod-stable identity', async () => {
    const { seedDir, quarantineDir } = tmpDirs();
    writeSeed(seedDir, '1852_11000', { id: 'AL000501', status: 'in_force' });
    const writes: Array<{ outputPath?: string; opts?: IngestOptions }> = [];
    const stats = newStats();

    await processWorklist([item('1852_11000', 'refetch_unknown', true)], OPTS, stats, {
      ingestFn: fakeIngest('AL000501', writes),
      seedDir,
      quarantineDir,
      sleepFn: noSleep,
    });

    // The old gate re-derived '1852:11000' and recorded a FALSE mismatch on
    // every full sweep. The held id must be the expectation instead.
    expect(writes).toHaveLength(1);
    expect(writes[0].opts?.expectedId).toBe('AL000501');
    expect(stats.failed).toEqual([]);
    expect(stats.fetched).toBe(1);
  });

  it('records a true mismatch as failed and leaves the held seed untouched', async () => {
    const { seedDir, quarantineDir } = tmpDirs();
    const seedPath = writeSeed(seedDir, '1993_812', { id: '1993:812', good: true });
    const before = fs.readFileSync(seedPath, 'utf-8');
    const stats = newStats();

    await processWorklist([item('1993_812', 'refetch_unknown', true)], OPTS, stats, {
      ingestFn: fakeIngest('2007:1016', []),
      seedDir,
      quarantineDir,
      sleepFn: noSleep,
    });

    expect(stats.failed).toHaveLength(1);
    expect(stats.failed[0].id).toBe('1993_812');
    expect(stats.failed[0].error).toMatch(/identity mismatch/i);
    expect(fs.readFileSync(seedPath, 'utf-8')).toBe(before);
  });

  it('fetch_new has no held identity: the served id IS the identity, no gate fires', async () => {
    const { seedDir, quarantineDir } = tmpDirs();
    const writes: Array<{ outputPath?: string; opts?: IngestOptions }> = [];
    const stats = newStats();

    await processWorklist([item('2026_510', 'fetch_new', false)], OPTS, stats, {
      ingestFn: fakeIngest('2026:510', writes),
      seedDir,
      quarantineDir,
      sleepFn: noSleep,
    });

    expect(writes[0].opts?.expectedId).toBeUndefined();
    expect(stats.fetched).toBe(1);
  });
});

describe('processWorklist gone-upstream quarantine', () => {
  const goneIngest = async (): Promise<IngestResult> => {
    throw new GoneUpstreamError('https://x/xml', 404);
  };

  it('quarantines the held seed to the quarantine dir — rename, not delete, never keep serving', async () => {
    const { seedDir, quarantineDir } = tmpDirs();
    const seedPath = writeSeed(seedDir, '1993_1054', { id: '1993:1054', status: 'in_force' });
    const stats = newStats();

    // Round 3: quarantine demands removal-grade evidence — sitemap-absent
    // AND a second confirming 404 (the goneIngest fake 404s consistently).
    await processWorklist(
      [{ ...item('1993_1054', 'refetch_unknown', true), inSitemap: false }],
      OPTS,
      stats,
      {
        ingestFn: goneIngest,
        seedDir,
        quarantineDir,
        sleepFn: noSleep,
      },
    );

    expect(fs.existsSync(seedPath)).toBe(false); // no longer served
    const quarantined = path.join(quarantineDir, '1993_1054.json');
    expect(fs.existsSync(quarantined)).toBe(true); // preserved, not deleted
    expect(JSON.parse(fs.readFileSync(quarantined, 'utf-8')).id).toBe('1993:1054');
    expect(stats.goneUpstream).toEqual([{ id: '1993_1054', httpStatus: 404, quarantined: true }]);
    expect(stats.failed).toEqual([]); // gone is a finding, not a failure
  });

  it('gone on a never-held document quarantines nothing but is still enumerated', async () => {
    const { seedDir, quarantineDir } = tmpDirs();
    const stats = newStats();

    await processWorklist(
      [{ ...item('2026_999', 'fetch_new', false), inSitemap: false }],
      OPTS,
      stats,
      {
        ingestFn: goneIngest,
        seedDir,
        quarantineDir,
        sleepFn: noSleep,
      },
    );

    expect(stats.goneUpstream).toEqual([{ id: '2026_999', httpStatus: 404, quarantined: false }]);
  });
});

describe('processWorklist skips', () => {
  it('does not invoke ingest for skip decisions', async () => {
    const { seedDir, quarantineDir } = tmpDirs();
    const writes: Array<{ outputPath?: string; opts?: IngestOptions }> = [];
    const stats = newStats();

    await processWorklist(
      [item('2019_241', 'skip_current', true), item('2007_1016', 'skip_existing', true)],
      OPTS,
      stats,
      { ingestFn: fakeIngest('x', writes), seedDir, quarantineDir, sleepFn: noSleep },
    );

    expect(writes).toEqual([]);
    expect(stats.skipped).toBe(2);
    expect(stats.total).toBe(2);
  });
});

describe('gone-evidence strengthening (PR #90 round 3)', () => {
  // Round 2 escalated the gone consequence to corpus removal (quarantine)
  // on a SINGLE unretried 404. Removal-grade evidence now requires: the
  // sitemap must NOT list the document, and a second probe must confirm.
  it('treats 404 on a sitemap-listed document as a FAILURE, never gone', async () => {
    const { seedDir, quarantineDir } = tmpDirs();
    const seedPath = writeSeed(seedDir, '1993_812', { id: '1993:812' });
    const stats = newStats();
    const it812 = { ...item('1993_812', 'refetch_unknown', true), inSitemap: true };
    const ingestFn = async (): Promise<IngestResult> => {
      throw new GoneUpstreamError('url', 404);
    };
    await processWorklist([it812], OPTS, stats, { seedDir, quarantineDir, ingestFn, sleepFn: noSleep });
    expect(stats.goneUpstream).toHaveLength(0);
    expect(stats.failed).toHaveLength(1);
    expect(stats.failed[0].error).toMatch(/sitemap/i);
    expect(fs.existsSync(seedPath)).toBe(true); // seed untouched
  });

  it('re-probes a sitemap-absent 404 once and quarantines only on a second 404', async () => {
    const { seedDir, quarantineDir } = tmpDirs();
    writeSeed(seedDir, '1993_813', { id: '1993:813' });
    const stats = newStats();
    const it813 = { ...item('1993_813', 'refetch_unknown', true), inSitemap: false };
    let calls = 0;
    const ingestFn = async (): Promise<IngestResult> => {
      calls += 1;
      throw new GoneUpstreamError('url', 404);
    };
    await processWorklist([it813], OPTS, stats, { seedDir, quarantineDir, ingestFn, sleepFn: noSleep });
    expect(calls).toBe(2); // confirming probe happened
    expect(stats.goneUpstream).toHaveLength(1);
    expect(stats.failed).toHaveLength(0);
  });

  it('a transient 404 that succeeds on the confirming probe is fetched, not gone', async () => {
    const { seedDir, quarantineDir } = tmpDirs();
    writeSeed(seedDir, '1993_814', { id: '1993:814' });
    const stats = newStats();
    const it814 = { ...item('1993_814', 'refetch_unknown', true), inSitemap: false };
    let calls = 0;
    const ingestFn = async (): Promise<IngestResult> => {
      calls += 1;
      if (calls === 1) throw new GoneUpstreamError('url', 404);
      return { seedId: '1993:814', status: 'in_force' } as IngestResult;
    };
    await processWorklist([it814], OPTS, stats, { seedDir, quarantineDir, ingestFn, sleepFn: noSleep });
    expect(stats.fetched).toBe(1);
    expect(stats.goneUpstream).toHaveLength(0);
  });
});

describe('identity-gate coverage for unheld identities (PR #90 round 3)', () => {
  // fetch_new items and unreadable-held seeds had NO identity verification:
  // a redirect to a different document's XML wrote the wrong body under the
  // item's filename. The URL-derived id is now passed as a shape-conditional
  // expectation: enforced when the served id is year:number-shaped.
  it('passes the URL-derived id when no held identity exists', async () => {
    const { seedDir, quarantineDir } = tmpDirs();
    const stats = newStats();
    const itNew = { ...item('2026_100', 'fetch_new', false), inSitemap: true };
    let seen: IngestOptions | undefined;
    const ingestFn = async (_u: string, _o: string, opts: IngestOptions): Promise<IngestResult> => {
      seen = opts;
      return { seedId: '2026:100', status: 'in_force' } as IngestResult;
    };
    await processWorklist([itNew], OPTS, stats, { seedDir, quarantineDir, ingestFn, sleepFn: noSleep });
    expect(seen?.urlDerivedId).toBe('2026:100');
    expect(seen?.expectedId).toBeUndefined();
  });
});
