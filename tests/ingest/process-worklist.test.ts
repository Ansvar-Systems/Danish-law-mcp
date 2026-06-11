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

    await processWorklist([item('1993_1054', 'refetch_unknown', true)], OPTS, stats, {
      ingestFn: goneIngest,
      seedDir,
      quarantineDir,
      sleepFn: noSleep,
    });

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

    await processWorklist([item('2026_999', 'fetch_new', false)], OPTS, stats, {
      ingestFn: goneIngest,
      seedDir,
      quarantineDir,
      sleepFn: noSleep,
    });

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
