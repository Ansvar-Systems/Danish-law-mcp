/**
 * Durable run records (PR #90 round 2).
 *
 * The killed 51h sweep left NO machine-readable record of its start time —
 * the exact --skip-stamped-since resume cutoff — because the report was
 * written only at successful completion and its default path was keyed by
 * DATE only (same-day rerun overwrites it). Required: a run-start marker
 * written at startup, run-stamped (not date-only) report paths, and a
 * partial report on SIGINT/SIGTERM.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  runStamp,
  buildReportPath,
  writeRunMarker,
  writeReport,
  makeInterruptHandler,
} from '../../scripts/lib/run-report.js';

const STARTED = '2026-06-10T20:22:27.792Z';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dk-report-test-'));
}

describe('runStamp', () => {
  it('is filesystem-safe and second+millisecond precise', () => {
    expect(runStamp(STARTED)).toBe('2026-06-10T20-22-27-792Z');
    expect(runStamp(STARTED)).not.toMatch(/[:.]/);
  });
});

describe('buildReportPath', () => {
  it('stamps the full run start, not just the date — same-day reruns must not overwrite', () => {
    const p = buildReportPath('/reports', STARTED);
    expect(p).toBe('/reports/ingest-refresh-2026-06-10T20-22-27-792Z.json');
    const later = buildReportPath('/reports', '2026-06-10T21:00:00.000Z');
    expect(later).not.toBe(p);
  });

  it('respects an explicit --report override', () => {
    expect(buildReportPath('/reports', STARTED, '/tmp/custom.json')).toBe('/tmp/custom.json');
  });
});

describe('writeRunMarker', () => {
  it('writes a run-stamped marker at startup so an interrupted run keeps its resume cutoff', () => {
    const dir = tmpDir();
    const marker = writeRunMarker(dir, {
      run_started_at: STARTED,
      mode: 'refresh',
      skip_stamped_since: null,
    });
    expect(path.basename(marker)).toBe('run-started-2026-06-10T20-22-27-792Z.json');
    const parsed = JSON.parse(fs.readFileSync(marker, 'utf-8'));
    expect(parsed.run_started_at).toBe(STARTED);
    expect(parsed.mode).toBe('refresh');
  });

  it('creates the report directory if missing', () => {
    const dir = path.join(tmpDir(), 'reports');
    const marker = writeRunMarker(dir, { run_started_at: STARTED });
    expect(fs.existsSync(marker)).toBe(true);
  });
});

describe('writeReport', () => {
  it('writes parseable JSON with a trailing newline', () => {
    const dir = tmpDir();
    const p = path.join(dir, 'r.json');
    writeReport(p, { run_started_at: STARTED, stats: { fetched: 1 } });
    const raw = fs.readFileSync(p, 'utf-8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(JSON.parse(raw).stats.fetched).toBe(1);
  });
});

describe('makeInterruptHandler', () => {
  it('writes a partial report marked interrupted and exits with the conventional signal code', () => {
    const dir = tmpDir();
    const reportPath = path.join(dir, 'r.json');
    const exits: number[] = [];
    const handler = makeInterruptHandler({
      reportPath,
      payload: () => ({ run_started_at: STARTED, stats: { fetched: 42 } }),
      exitFn: (code) => {
        exits.push(code);
      },
    });

    handler('SIGTERM');
    const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    expect(parsed.interrupted_by).toBe('SIGTERM');
    expect(parsed.partial).toBe(true);
    expect(parsed.stats.fetched).toBe(42);
    expect(exits).toEqual([143]);

    handler('SIGINT');
    expect(exits).toEqual([143, 130]);
    expect(JSON.parse(fs.readFileSync(reportPath, 'utf-8')).interrupted_by).toBe('SIGINT');
  });

  it('still exits if the report write fails — a broken disk must not hang shutdown', () => {
    const exits: number[] = [];
    const logs: string[] = [];
    // Parent "directory" is a FILE: mkdir/open fail with ENOTDIR — a real
    // write failure, not a missing dir that writeReport would just create.
    const notADir = path.join(tmpDir(), 'not-a-dir');
    fs.writeFileSync(notADir, 'x', 'utf-8');
    const handler = makeInterruptHandler({
      reportPath: path.join(notADir, 'r.json'),
      payload: () => ({}),
      exitFn: (code) => {
        exits.push(code);
      },
      log: (line) => {
        logs.push(line);
      },
    });
    handler('SIGINT');
    expect(exits).toEqual([130]);
    expect(logs.join('\n')).toMatch(/failed to write partial report/);
  });
});
