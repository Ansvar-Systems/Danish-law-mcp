/**
 * Version identity of a served Retsinformation document (issue #89).
 *
 * Every /eli/lta/{year}/{number}/xml payload identifies exactly which
 * consolidation it is (AccessionNumber) and whether it is still current law
 * (<Status> + validity window). The 2026-02-15 bulk sweep threw this
 * information away and silently defaulted every unrecognized <Status> text
 * (including "Historic") to in_force — 22,182 of 62,762 seeds carry a
 * fetch-time historic doc-type marker yet claim to be current.
 *
 * Rules (verified against live upstream 2026-06-10):
 *   - `<Status>` is the per-document currency signal: Valid = current law,
 *     Historic = superseded. The website's own timeline API agrees
 *     (isHistoric flag).
 *   - `<EndDate>` is NOT supersession evidence — it is the date the
 *     consolidation is amended/tracked through. Proven live: kursgevinstloven
 *     LBK 2025/1176 serves Status=Valid with EndDate 2026-01-20 in the past
 *     and its timeline says isHistoric=false (current). Mapping EndDate-past
 *     to repealed would wrongly repeal current law. EndDate is stamped in
 *     `_ingest` for refresh decisions only.
 *   - Mapping is EXPLICIT. Unknown or missing status vocabulary THROWS
 *     UnknownUpstreamStatusError; the caller records the document as failed.
 *     Accuracy over availability — a wrong "in_force" is worse than a gap.
 */

export interface VersionIdentity {
  /** AccessionNumber of the served consolidation, e.g. 'A20190024129'. */
  accession: string | null;
  /** Retsinformation DocumentId, e.g. 'CK002013'. */
  document_id: string | null;
  /** UniqueDocumentId, e.g. '207970'. */
  unique_document_id: string | null;
  /** Raw <Status> text exactly as served, e.g. 'Historic', 'Valid'. */
  upstream_status: string | null;
  /** <StartDate> (validity start), ISO 'YYYY-MM-DD'. */
  start_date: string | null;
  /** <EndDate> (validity end), ISO 'YYYY-MM-DD'. */
  end_date: string | null;
  /** <DateOfHistoricMark>, ISO 'YYYY-MM-DD'. */
  historic_marked: string | null;
}

export type SeedStatus = 'in_force' | 'repealed' | 'not_yet_in_force';

export class UnknownUpstreamStatusError extends Error {
  constructor(statusText: string | null) {
    super(
      `unknown upstream status ${statusText === null ? '<missing>' : JSON.stringify(statusText)} — ` +
        'refusing to guess (the 2026-02-15 sweep defaulted "Historic" to in_force). ' +
        'Extend the explicit mapping in scripts/lib/version-identity.ts deliberately.',
    );
    this.name = 'UnknownUpstreamStatusError';
  }
}

function textOf(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    const s = String(node).trim();
    return s.length > 0 ? s : null;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      const t = textOf(item);
      if (t) return t;
    }
    return null;
  }
  if (typeof node === 'object') {
    const record = node as Record<string, unknown>;
    // fast-xml-parser puts element text under '#text' when attributes exist.
    if ('#text' in record) return textOf(record['#text']);
  }
  return null;
}

function isoDateOf(node: unknown): string | null {
  const text = textOf(node);
  if (!text) return null;
  const m = text.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/** Extract the served consolidation identity from a parsed Dokument.Meta node. */
export function extractVersionIdentity(meta: Record<string, unknown>): VersionIdentity {
  return {
    accession: textOf(meta.AccessionNumber),
    document_id: textOf(meta.DocumentId),
    unique_document_id: textOf(meta.UniqueDocumentId),
    upstream_status: textOf(meta.Status),
    start_date: isoDateOf(meta.StartDate),
    end_date: isoDateOf(meta.EndDate),
    historic_marked: isoDateOf(meta.DateOfHistoricMark),
  };
}

const IN_FORCE_STATUSES = new Set(['valid', 'gældende', 'gaeldende', 'gallende']);
const REPEALED_STATUSES = new Set(['historic', 'historisk']);

/**
 * Map a served version identity to the seed status: explicit status
 * vocabulary first, then the in-force date window, then REFUSE.
 */
export function mapSeedStatus(identity: VersionIdentity, today: string): SeedStatus {
  const raw = identity.upstream_status;
  const normalized = (raw ?? '').trim().toLowerCase();

  if (REPEALED_STATUSES.has(normalized)) return 'repealed';
  if (IN_FORCE_STATUSES.has(normalized)) {
    if (identity.start_date && identity.start_date > today) return 'not_yet_in_force';
    return 'in_force';
  }

  throw new UnknownUpstreamStatusError(raw);
}
