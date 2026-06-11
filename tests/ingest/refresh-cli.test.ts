/**
 * CLI argument validation for the bulk refresh runner (PR #90 round 2).
 *
 * Number.parseInt('abc') is NaN and `NaN < 2000` is false, so a typo'd
 * --delay-ms silently disabled the politeness floor and the 63k-item sweep
 * would hammer retsinformation.dk back-to-back. Every numeric flag must be
 * Number.isFinite-validated; --skip-stamped-since (the resume lever that
 * decides what gets SKIPPED) must be full ISO-8601 UTC or fail loud.
 */
import { describe, it, expect } from 'vitest';
import { parseRefreshArgs, REQUEST_DELAY_MS } from '../../scripts/lib/refresh-cli.js';

describe('parseRefreshArgs — numeric flags', () => {
  it('defaults: politeness-floor delay, no dry-run, additive mode', () => {
    const o = parseRefreshArgs([]);
    expect(o.delayMs).toBe(REQUEST_DELAY_MS);
    expect(o.dryRun).toBe(false);
    expect(o.refresh).toBe(false);
  });

  it('rejects a non-numeric --delay-ms instead of silently disabling pacing', () => {
    expect(() => parseRefreshArgs(['--delay-ms', 'abc'])).toThrow(/--delay-ms/);
  });

  it('rejects --delay-ms with a missing value (must not consume the next flag)', () => {
    expect(() => parseRefreshArgs(['--delay-ms'])).toThrow(/--delay-ms/);
    expect(() => parseRefreshArgs(['--delay-ms', '--refresh'])).toThrow(/--delay-ms/);
  });

  it('rejects trailing-garbage numerics that parseInt would silently truncate', () => {
    expect(() => parseRefreshArgs(['--limit', '500abc'])).toThrow(/--limit/);
  });

  it('enforces the politeness floor', () => {
    expect(() => parseRefreshArgs(['--delay-ms', '100'])).toThrow(/politeness floor/);
  });

  it('enforces the politeness floor for --dry-run too — dry runs still fetch live sitemap pages', () => {
    expect(() => parseRefreshArgs(['--delay-ms', '100', '--dry-run'])).toThrow(/politeness floor/);
  });

  it('accepts a delay at or above the floor', () => {
    expect(parseRefreshArgs(['--delay-ms', '2500']).delayMs).toBe(2500);
    expect(parseRefreshArgs(['--delay-ms', String(REQUEST_DELAY_MS)]).delayMs).toBe(REQUEST_DELAY_MS);
  });

  it('validates every numeric flag', () => {
    expect(() => parseRefreshArgs(['--limit', 'x'])).toThrow(/--limit/);
    expect(() => parseRefreshArgs(['--year-start', 'x'])).toThrow(/--year-start/);
    expect(() => parseRefreshArgs(['--year-end', 'x'])).toThrow(/--year-end/);
    expect(() => parseRefreshArgs(['--max-pages', 'x'])).toThrow(/--max-pages/);
    expect(() => parseRefreshArgs(['--limit'])).toThrow(/--limit/);
  });

  it('still rejects unknown arguments', () => {
    expect(() => parseRefreshArgs(['--frobnicate'])).toThrow(/Unknown argument/);
  });
});

describe('parseRefreshArgs — --skip-stamped-since', () => {
  it('accepts full ISO-8601 UTC and normalizes to millisecond precision for exact lexicographic compare with toISOString stamps', () => {
    const o = parseRefreshArgs(['--refresh', '--skip-stamped-since', '2026-06-10T20:22:27Z']);
    expect(o.skipStampedSince).toBe('2026-06-10T20:22:27.000Z');
    const oMs = parseRefreshArgs(['--refresh', '--skip-stamped-since', '2026-06-10T20:22:27.792Z']);
    expect(oMs.skipStampedSince).toBe('2026-06-10T20:22:27.792Z');
  });

  it('rejects a missing value instead of silently no-opping the resume lever', () => {
    expect(() => parseRefreshArgs(['--refresh', '--skip-stamped-since'])).toThrow(/--skip-stamped-since/);
    expect(() => parseRefreshArgs(['--skip-stamped-since', '--refresh'])).toThrow(/--skip-stamped-since/);
  });

  it('rejects date-only values — lexicographic compare would silently shift the skip boundary', () => {
    expect(() => parseRefreshArgs(['--skip-stamped-since', '2026-06-10'])).toThrow(/ISO-8601 UTC/);
  });

  it('rejects offset-bearing timestamps — stamps are UTC Z, an offset shifts the boundary', () => {
    expect(() => parseRefreshArgs(['--skip-stamped-since', '2026-06-10T20:22:27+02:00'])).toThrow(
      /ISO-8601 UTC/,
    );
  });

  it('rejects shape-valid but impossible timestamps', () => {
    expect(() => parseRefreshArgs(['--skip-stamped-since', '2026-13-99T99:99:99Z'])).toThrow(
      /--skip-stamped-since/,
    );
  });

  it('rejects typo garbage', () => {
    expect(() => parseRefreshArgs(['--skip-stamped-since', '2026-06-10T2O:22:27Z'])).toThrow(
      /--skip-stamped-since/,
    );
  });
});

describe('positive-integer flags (PR #90 round 3)', () => {
  // --limit 0 / negative silently DISABLED the limit (applyLimit treats
  // falsy/<=0 as "no limit") while the banner printed "Limit: 0".
  it.each([
    ['--limit', '0'],
    ['--limit', '-100'],
    ['--max-pages', '0'],
    ['--max-pages', '-1'],
  ])('rejects %s %s loudly', (flag, value) => {
    expect(() => parseRefreshArgs([flag, value])).toThrow(/positive/i);
  });

  it('still accepts positive values', () => {
    expect(parseRefreshArgs(['--limit', '5']).limit).toBe(5);
  });
});
