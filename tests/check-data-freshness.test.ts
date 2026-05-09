import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from '@ansvar/mcp-sqlite';
import { checkDataFreshness } from '../src/tools/check-data-freshness.js';

function addMetadata(db: InstanceType<typeof Database>, entries: Record<string, string>): void {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS db_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  ).run();
  const insert = db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(entries)) {
    insert.run(k, v);
  }
}

describe('check_data_freshness', () => {
  let db: InstanceType<typeof Database>;
  let tmp: string;
  let sourcesPath: string;

  beforeEach(() => {
    db = new Database(':memory:');
    tmp = mkdtempSync(join(tmpdir(), 'cdf-test-'));
    sourcesPath = join(tmp, 'sources.yml');
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('returns build_timestamp and per-source last_verified with staleness_days', () => {
    addMetadata(db, { built_at: '2026-05-02T10:00:00.000Z' });
    writeFileSync(
      sourcesPath,
      `sources:
  - name: "Lovdata API"
    authority: "Stiftelsen Lovdata"
    official_portal: "https://api.lovdata.no/"
    last_verified: "2026-05-09"
`,
    );
    const now = new Date('2026-05-09T12:00:00.000Z');

    const result = checkDataFreshness(db, { sourcesYmlPath: sourcesPath, now });

    expect(result.build_timestamp).toBe('2026-05-02T10:00:00.000Z');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].publisher).toBe('Stiftelsen Lovdata');
    expect(result.sources[0].source_url).toBe('https://api.lovdata.no/');
    expect(result.sources[0].last_verified).toBe('2026-05-09');
    expect(result.sources[0].staleness_days).toBe(0);
    expect(result.has_stale_sources).toBe(false);
    expect(result.staleness_threshold_days).toBe(90);
  });

  it('flags has_stale_sources when any source is past the 90-day threshold', () => {
    addMetadata(db, { built_at: '2026-01-01T00:00:00.000Z' });
    writeFileSync(
      sourcesPath,
      `sources:
  - name: "Recent source"
    authority: "Recent"
    last_verified: "2026-04-15"
  - name: "Stale source"
    authority: "Stale"
    last_verified: "2026-01-15"
`,
    );
    const now = new Date('2026-05-09T00:00:00.000Z');

    const result = checkDataFreshness(db, { sourcesYmlPath: sourcesPath, now });

    expect(result.sources).toHaveLength(2);
    const recent = result.sources.find((s) => s.publisher === 'Recent')!;
    const stale = result.sources.find((s) => s.publisher === 'Stale')!;
    expect(recent.staleness_days).toBeLessThanOrEqual(90);
    expect(stale.staleness_days).toBeGreaterThan(90);
    expect(result.has_stale_sources).toBe(true);
  });

  it('returns staleness_days=999 when last_verified is missing or non-ISO', () => {
    addMetadata(db, { built_at: '2026-05-02T10:00:00.000Z' });
    writeFileSync(
      sourcesPath,
      `sources:
  - name: "No date"
    authority: "Missing"
  - name: "Bad date"
    authority: "Invalid"
    last_verified: "TBD"
`,
    );

    const result = checkDataFreshness(db, { sourcesYmlPath: sourcesPath });

    expect(result.sources[0].staleness_days).toBe(999);
    expect(result.sources[1].staleness_days).toBe(999);
    expect(result.has_stale_sources).toBe(true);
  });

  it('returns build_timestamp="unknown" when db_metadata is missing', () => {
    writeFileSync(
      sourcesPath,
      `sources:
  - name: "X"
    authority: "Y"
    last_verified: "2026-05-09"
`,
    );
    const now = new Date('2026-05-09T00:00:00.000Z');

    const result = checkDataFreshness(db, { sourcesYmlPath: sourcesPath, now });

    expect(result.build_timestamp).toBe('unknown');
  });

  it('honours a custom thresholdDays option', () => {
    addMetadata(db, { built_at: '2026-05-02T10:00:00.000Z' });
    writeFileSync(
      sourcesPath,
      `sources:
  - name: "Daily source"
    authority: "Court feed"
    last_verified: "2026-05-01"
`,
    );
    const now = new Date('2026-05-09T00:00:00.000Z');

    const result = checkDataFreshness(db, {
      sourcesYmlPath: sourcesPath,
      thresholdDays: 7,
      now,
    });

    expect(result.staleness_threshold_days).toBe(7);
    expect(result.sources[0].staleness_days).toBe(8);
    expect(result.has_stale_sources).toBe(true);
  });
});
