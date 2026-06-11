/**
 * CLI parsing for the bulk refresh runner (PR #90 round 2).
 *
 * Every numeric flag is Number.isFinite-validated: Number.parseInt('abc') is
 * NaN, `NaN < 2000` is false, and a typo'd --delay-ms silently disabled the
 * politeness floor for a 63k-request sweep. --skip-stamped-since — the resume
 * lever whose value decides what gets SKIPPED — must be full ISO-8601 UTC and
 * is normalized to millisecond precision so the lexicographic compare against
 * toISOString() stamps is exact. Unknown vocabulary fails loud.
 */

/** Politeness floor for retsinformation.dk: 2s start-to-start, sequential. */
export const REQUEST_DELAY_MS = 2_000;

export interface CLIOptions {
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

function flagValue(name: string, args: string[], i: number): string {
  const raw = args[i + 1];
  if (raw === undefined || raw.startsWith('--')) {
    throw new Error(`${name} requires a value (got ${raw === undefined ? 'nothing' : `"${raw}"`})`);
  }
  return raw;
}

function intFlag(name: string, args: string[], i: number, opts: { min?: number } = {}): number {
  const raw = flagValue(name, args, i);
  // Number(), not parseInt(): '500abc' must fail loud, not truncate to 500.
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${name} must be a finite integer, got "${raw}"`);
  }
  if (opts.min !== undefined && n < opts.min) {
    // 0/negative silently DISABLED limits downstream (applyLimit/sitemap
    // truncation treat <=0 as "none") while the banner printed the value —
    // a positive minimum keeps "no limit" an explicit omission, never a typo.
    throw new Error(`${name} must be a positive integer (>= ${opts.min}), got "${raw}"`);
  }
  return n;
}

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/u;

function isoUtcFlag(name: string, args: string[], i: number): string {
  const raw = flagValue(name, args, i);
  if (!ISO_UTC_PATTERN.test(raw)) {
    throw new Error(
      `${name} must be full ISO-8601 UTC, e.g. 2026-06-10T20:22:27Z or 2026-06-10T20:22:27.792Z — got "${raw}". ` +
        'Date-only or offset-bearing values silently shift the skip boundary.',
    );
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name}: "${raw}" is not a real timestamp`);
  }
  // Normalize to millisecond precision: stamps are new Date().toISOString(),
  // so identical formats make lexicographic order equal chronological order.
  return new Date(parsed).toISOString();
}

export function parseRefreshArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    dryRun: false,
    refresh: false,
    delayMs: REQUEST_DELAY_MS,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--limit':
        options.limit = intFlag('--limit', args, i++, { min: 1 });
        break;
      case '--year-start':
        options.yearStart = intFlag('--year-start', args, i++);
        break;
      case '--year-end':
        options.yearEnd = intFlag('--year-end', args, i++);
        break;
      case '--max-pages':
        options.maxPages = intFlag('--max-pages', args, i++, { min: 1 });
        break;
      case '--delay-ms':
        options.delayMs = intFlag('--delay-ms', args, i++);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--refresh':
        options.refresh = true;
        break;
      case '--skip-stamped-since':
        options.skipStampedSince = isoUtcFlag('--skip-stamped-since', args, i++);
        break;
      case '--report':
        options.reportPath = flagValue('--report', args, i++);
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

  // The floor applies to --dry-run too: dry runs still fetch every live
  // sitemap page from retsinformation.dk.
  if (options.delayMs < REQUEST_DELAY_MS) {
    throw new Error(
      `--delay-ms ${options.delayMs} is below the ${REQUEST_DELAY_MS}ms politeness floor for retsinformation.dk`,
    );
  }

  return options;
}
