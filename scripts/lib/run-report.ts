/**
 * Durable run records for the bulk refresh runner (PR #90 round 2).
 *
 * The killed 51h sweep left no machine-readable record of its start time —
 * the exact --skip-stamped-since resume cutoff — because the report was
 * written only at successful completion and its default path was keyed by
 * date only (a same-day rerun overwrote it, destroying the only durable
 * enumeration of failures). Now:
 *
 *   - a run-start MARKER file (run-stamped name) is written at startup;
 *   - the report path is run-stamped, never date-only;
 *   - SIGINT/SIGTERM write a partial report before exiting.
 */

import * as fs from 'fs';
import * as path from 'path';
import { writeFileAtomic } from './atomic-write.js';

/** Filesystem-safe stamp preserving full timestamp precision. */
export function runStamp(runStartedAt: string): string {
  return runStartedAt.replace(/[:.]/g, '-');
}

export function buildReportPath(
  reportDir: string,
  runStartedAt: string,
  overridePath?: string,
): string {
  return overridePath ?? path.join(reportDir, `ingest-refresh-${runStamp(runStartedAt)}.json`);
}

/**
 * Write the run-start marker. Returns the marker path. The marker is the
 * recovery record: if the run dies without a report, the cutoff for
 * `--refresh --skip-stamped-since <run_started_at>` is read from here.
 */
export function writeRunMarker(
  reportDir: string,
  payload: { run_started_at: string; [key: string]: unknown },
): string {
  const markerPath = path.join(reportDir, `run-started-${runStamp(payload.run_started_at)}.json`);
  fs.mkdirSync(reportDir, { recursive: true });
  writeFileAtomic(markerPath, `${JSON.stringify(payload, null, 2)}\n`);
  return markerPath;
}

export function writeReport(reportPath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileAtomic(reportPath, `${JSON.stringify(payload, null, 2)}\n`);
}

const SIGNAL_EXIT_CODES: Record<'SIGINT' | 'SIGTERM', number> = {
  SIGINT: 130,
  SIGTERM: 143,
};

/**
 * Build a signal handler that writes a partial report (best effort — a
 * broken disk must not hang shutdown) and exits with the conventional
 * 128+signal code.
 */
export function makeInterruptHandler(ctx: {
  reportPath: string;
  payload: () => unknown;
  exitFn?: (code: number) => void;
  log?: (line: string) => void;
}): (signal: 'SIGINT' | 'SIGTERM') => void {
  const exitFn = ctx.exitFn ?? ((code: number): void => process.exit(code));
  const log = ctx.log ?? ((line: string): void => console.error(line));

  return (signal: 'SIGINT' | 'SIGTERM'): void => {
    try {
      const base = ctx.payload();
      const payload =
        typeof base === 'object' && base !== null
          ? { ...(base as Record<string, unknown>), interrupted_by: signal, partial: true }
          : { payload: base, interrupted_by: signal, partial: true };
      writeReport(ctx.reportPath, payload);
      log(`${signal}: partial report written: ${ctx.reportPath}`);
    } catch (error) {
      log(
        `${signal}: failed to write partial report (${error instanceof Error ? error.message : String(error)}) — ` +
          'the run-start marker still holds the resume cutoff',
      );
    }
    exitFn(SIGNAL_EXIT_CODES[signal]);
  };
}
