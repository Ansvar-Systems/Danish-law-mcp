/**
 * check_data_freshness — mandatory meta-tool per law-mcp-golden-standard §4.1.
 *
 * Returns the corpus build timestamp and per-source last_verified dates with
 * staleness_days computed against a configurable threshold (default 90 days).
 * The watchdog probes this tool to alert on stale data; consumers call it to
 * verify the corpus is current before acting on results.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import type Database from '@ansvar/mcp-sqlite';
import { readDbMetadata } from '../capabilities.js';

const DEFAULT_STALENESS_THRESHOLD_DAYS = 90;
const UNKNOWN_STALENESS_DAYS = 999;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const MS_PER_DAY = 86_400_000;

export interface SourceFreshness {
  publisher: string;
  source_url: string;
  last_verified: string;
  staleness_days: number;
}

export interface CheckDataFreshnessResult {
  build_timestamp: string;
  sources: SourceFreshness[];
  has_stale_sources: boolean;
  staleness_threshold_days: number;
}

export interface CheckDataFreshnessOptions {
  /** Path to sources.yml. Defaults to `<cwd>/sources.yml`. */
  sourcesYmlPath?: string;
  /** Days past `last_verified` before a source is considered stale. */
  thresholdDays?: number;
  /** Reference time for staleness computation. Defaults to `new Date()`. */
  now?: Date;
}

interface SourceEntry {
  name?: string;
  authority?: string;
  official_portal?: string;
  last_verified?: string;
}

interface SourcesYml {
  sources?: SourceEntry[];
}

function computeStaleness(lastVerified: string | undefined, nowMs: number): number {
  if (!lastVerified || !ISO_DATE.test(lastVerified)) {
    return UNKNOWN_STALENESS_DAYS;
  }
  const parsed = Date.parse(lastVerified);
  if (Number.isNaN(parsed)) {
    return UNKNOWN_STALENESS_DAYS;
  }
  return Math.floor((nowMs - parsed) / MS_PER_DAY);
}

export function checkDataFreshness(
  db: InstanceType<typeof Database>,
  options: CheckDataFreshnessOptions = {},
): CheckDataFreshnessResult {
  const thresholdDays = options.thresholdDays ?? DEFAULT_STALENESS_THRESHOLD_DAYS;
  const nowMs = (options.now ?? new Date()).getTime();
  const sourcesYmlPath = options.sourcesYmlPath ?? resolve(process.cwd(), 'sources.yml');

  const meta = readDbMetadata(db);
  const buildTimestamp = meta.built_at;

  const yml = (yaml.load(readFileSync(sourcesYmlPath, 'utf8')) ?? {}) as SourcesYml;
  const entries = yml.sources ?? [];

  const sources: SourceFreshness[] = entries.map((s) => ({
    publisher: s.authority ?? s.name ?? 'unknown',
    source_url: s.official_portal ?? '',
    last_verified: s.last_verified ?? 'unknown',
    staleness_days: computeStaleness(s.last_verified, nowMs),
  }));

  return {
    build_timestamp: buildTimestamp,
    sources,
    has_stale_sources: sources.some((s) => s.staleness_days > thresholdDays),
    staleness_threshold_days: thresholdDays,
  };
}
