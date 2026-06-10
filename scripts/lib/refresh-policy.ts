/**
 * Version-keyed refresh decisions for the Retsinformation corpus (issue #89,
 * ported from Dutch-law-mcp#117/#119).
 *
 * Danish upstream reality, measured 2026-06-10:
 *   - The sitemap lastmod does NOT track status/metadata changes: 2019/241
 *     was historic-marked 2019-07-04 and EndDate-stamped during 2026, yet
 *     its lastmod is still its publication date 2019-03-16. lastmod can
 *     therefore never PROVE a seed current.
 *   - The harvest API (api.retsinformation.dk/v1/Documents) serves only a
 *     10-day window — useless for reconstructing changes since the
 *     2026-02-15 sweep, fine for daily incremental harvest going forward.
 *
 * Consequence: there is no cheap per-document currency proof. The policy
 * refetches whenever freshness is unproven (accuracy over cheapness). The
 * only skips are exact:
 *   - additive mode (refresh=false) keeps the historic skip-existing
 *     behaviour;
 *   - `skipStampedSince` skips seeds this very run already stamped — exact
 *     resume after an interruption, not a freshness heuristic;
 *   - unstamped seeds (the entire pre-fix corpus) self-heal unconditionally.
 */

import type { VersionIdentity, SeedStatus } from './version-identity.js';

export interface SeedIngestMeta extends VersionIdentity {
  /** ISO timestamp the seed content was fetched. */
  retrieved_at: string;
  /** Seed status derived from the identity at stamp time. */
  seed_status: SeedStatus;
}

export type FetchDecision =
  | 'fetch_new'
  | 'refetch_changed'
  | 'refetch_unknown'
  | 'skip_current'
  | 'skip_existing';

export function decideFetch(opts: {
  seedExists: boolean;
  refresh: boolean;
  existingMeta?: SeedIngestMeta | null;
  /**
   * Skip seeds stamped at/after this ISO timestamp (same-run resume cutoff:
   * pass the start time of the interrupted run).
   */
  skipStampedSince?: string | null;
  /** ISO 'YYYY-MM-DD'. */
  today: string;
}): FetchDecision {
  if (!opts.seedExists) return 'fetch_new';
  if (!opts.refresh) return 'skip_existing';

  // A seed without a stamp predates version-identity acquisition and may
  // carry a silently-defaulted status. No fallback may ever prove such a
  // seed current — self-heal is unconditional.
  const meta = opts.existingMeta;
  if (!meta || !meta.retrieved_at) return 'refetch_unknown';

  if (opts.skipStampedSince && meta.retrieved_at >= opts.skipStampedSince) {
    return 'skip_current';
  }

  // The stamped amended-through window (<EndDate>) closed after the stamp
  // was written: upstream has registered later amendments, so a newer
  // consolidation may exist. Refetch and let the served <Status> decide —
  // EndDate alone is never a status claim.
  if (meta.seed_status === 'in_force' && meta.end_date && meta.end_date < opts.today) {
    return 'refetch_changed';
  }

  return 'refetch_unknown';
}

/** Stamp one canonical `_ingest` shape onto a seed object. */
export function stampIngestMeta<T extends object>(
  seed: T,
  identity: VersionIdentity,
  seedStatus: SeedStatus,
  now: string,
): T & { _ingest: SeedIngestMeta } {
  return {
    ...seed,
    _ingest: {
      retrieved_at: now,
      accession: identity.accession,
      document_id: identity.document_id,
      unique_document_id: identity.unique_document_id,
      upstream_status: identity.upstream_status,
      start_date: identity.start_date,
      end_date: identity.end_date,
      historic_marked: identity.historic_marked,
      seed_status: seedStatus,
    },
  };
}
