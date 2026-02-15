/**
 * MCP Tool: get_provision_at_date
 *
 * Time-travel query: retrieve provision text as it read on a specific date.
 *
 * This tool enables historical legal research by showing how a statute provision
 * was worded at any point in time, accounting for all amendments.
 */

import type { Database } from '@ansvar/mcp-sqlite';

export interface GetProvisionAtDateParams {
  /** SFS number of statute, e.g., "2018:218" */
  sfs: string;

  /** Provision reference, e.g., "1:3" or "5" */
  provision_ref: string;

  /** ISO date (YYYY-MM-DD) to query, e.g., "2020-06-15" */
  date: string;

  /** Include amendment history after this date (optional) */
  include_amendments?: boolean;
}

export interface ProvisionVersion {
  /** Provision reference */
  provision_ref: string;

  /** Chapter number (if chaptered statute) */
  chapter?: string;

  /** Section number */
  section: string;

  /** Provision title/heading */
  title?: string;

  /** Full provision text as of the specified date */
  content: string;

  /** Date this version became effective */
  valid_from: string | null;

  /** Date this version was superseded (null if current) */
  valid_to: string | null;

  /** Version status */
  status: 'current' | 'historical' | 'future' | 'not_found';

  /** Amendment history (if include_amendments = true) */
  amendments?: AmendmentRecord[];
}

export interface AmendmentRecord {
  /** SFS number of amending statute */
  amended_by_sfs: string;

  /** Date amendment took effect */
  amendment_date: string;

  /** Type of amendment */
  amendment_type: string;

  /** Summary of changes */
  change_summary?: string;
}

export function getProvisionAtDate(
  db: Database,
  params: GetProvisionAtDateParams
): ProvisionVersion {
  const { sfs, provision_ref, date, include_amendments = false } = params;

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD.`);
  }

  // Query for provision version valid at the specified date
  const query = `
    SELECT
      provision_ref,
      chapter,
      section,
      title,
      content,
      valid_from,
      valid_to
    FROM legal_provision_versions
    WHERE document_id = ?
      AND provision_ref = ?
      AND (valid_from IS NULL OR valid_from <= ?)
      AND (valid_to IS NULL OR valid_to > ?)
    ORDER BY valid_from DESC
    LIMIT 1
  `;

  const row = db.prepare(query).get(sfs, provision_ref, date, date) as {
    provision_ref: string;
    chapter: string | null;
    section: string;
    title: string | null;
    content: string;
    valid_from: string | null;
    valid_to: string | null;
  } | undefined;

  if (!row) {
    // Check if provision exists at all (maybe not yet enacted on this date)
    const existsQuery = `
      SELECT MIN(valid_from) as earliest_date
      FROM legal_provision_versions
      WHERE document_id = ? AND provision_ref = ?
    `;

    const existsRow = db.prepare(existsQuery).get(sfs, provision_ref) as {
      earliest_date: string | null;
    } | undefined;

    if (existsRow?.earliest_date && existsRow.earliest_date > date) {
      return {
        provision_ref,
        chapter: undefined,
        section: provision_ref.includes(':') ? provision_ref.split(':')[1] : provision_ref,
        content: '',
        valid_from: existsRow.earliest_date,
        valid_to: null,
        status: 'future',
      };
    }

    // Provision doesn't exist
    return {
      provision_ref,
      chapter: undefined,
      section: provision_ref.includes(':') ? provision_ref.split(':')[1] : provision_ref,
      content: '',
      valid_from: null,
      valid_to: null,
      status: 'not_found',
    };
  }

  // Determine status
  let status: 'current' | 'historical';
  if (row.valid_to === null) {
    status = 'current';
  } else {
    status = 'historical';
  }

  const result: ProvisionVersion = {
    provision_ref: row.provision_ref,
    chapter: row.chapter ?? undefined,
    section: row.section,
    title: row.title ?? undefined,
    content: row.content,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    status,
  };

  // Include amendment history if requested
  if (include_amendments) {
    const amendmentsQuery = `
      SELECT
        amended_by_sfs,
        amendment_date,
        amendment_type,
        change_summary
      FROM statute_amendments
      WHERE target_document_id = ?
        AND target_provision_ref = ?
        AND amendment_date > ?
      ORDER BY amendment_date
    `;

    const amendments = db.prepare(amendmentsQuery).all(
      sfs,
      provision_ref,
      row.valid_from ?? '1900-01-01'
    ) as AmendmentRecord[];

    result.amendments = amendments;
  }

  return result;
}

export const toolDefinition = {
  name: 'get_provision_at_date',
  description: `
Retrieve Danish statute provision text as it read on a specific date (time-travel query).

This tool enables historical legal research by showing how a provision was worded
at any point in time, accounting for all amendments since original enactment.

Use cases:
- "What did Dataskyddslagen 3:5 say in 2019?"
- "Show me Brottsbalken 3:1 before the 2019 amendment"
- "Was this provision in force on 2020-06-15?"

Supports:
- Historical versions (any date in the past)
- Current version (today's date)
- Future provisions (enacted but not yet in force)

Returns the complete provision text, validity dates, and optionally the
amendment history showing what changed after the queried date.
  `.trim(),

  inputSchema: {
    type: 'object',
    properties: {
      sfs: {
        type: 'string',
        description: 'SFS number (e.g., "2018:218" for Dataskyddslagen)',
        pattern: '^\\d{4}:\\d+$',
      },
      provision_ref: {
        type: 'string',
        description: 'Provision reference (e.g., "1:3" or "5")',
      },
      date: {
        type: 'string',
        description: 'ISO date (YYYY-MM-DD) to query',
        pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      },
      include_amendments: {
        type: 'boolean',
        description: 'Include amendment history after this date (default: false)',
        default: false,
      },
    },
    required: ['sfs', 'provision_ref', 'date'],
  },
};

/**
 * Get current version of a provision (as of today).
 */
export function getCurrentProvision(
  db: Database,
  sfs: string,
  provision_ref: string
): ProvisionVersion {
  const today = new Date().toISOString().split('T')[0];
  return getProvisionAtDate(db, { sfs, provision_ref, date: today });
}

/**
 * Get all historical versions of a provision.
 */
export function getAllVersions(
  db: Database,
  sfs: string,
  provision_ref: string
): ProvisionVersion[] {
  const query = `
    SELECT
      provision_ref,
      chapter,
      section,
      title,
      content,
      valid_from,
      valid_to
    FROM legal_provision_versions
    WHERE document_id = ?
      AND provision_ref = ?
    ORDER BY valid_from ASC
  `;

  const rows = db.prepare(query).all(sfs, provision_ref) as Array<{
    provision_ref: string;
    chapter: string | null;
    section: string;
    title: string | null;
    content: string;
    valid_from: string | null;
    valid_to: string | null;
  }>;

  return rows.map(row => ({
    provision_ref: row.provision_ref,
    chapter: row.chapter ?? undefined,
    section: row.section,
    title: row.title ?? undefined,
    content: row.content,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    status: row.valid_to === null ? 'current' : 'historical',
  }));
}

/**
 * Compare provision text between two dates.
 */
export function diffProvisionDates(
  db: Database,
  sfs: string,
  provision_ref: string,
  date1: string,
  date2: string
): {
  version1: ProvisionVersion;
  version2: ProvisionVersion;
  changed: boolean;
  amendments_between: AmendmentRecord[];
} {
  const version1 = getProvisionAtDate(db, { sfs, provision_ref, date: date1 });
  const version2 = getProvisionAtDate(db, { sfs, provision_ref, date: date2 });

  const changed = version1.content !== version2.content;

  // Get amendments between the two dates
  const amendmentsQuery = `
    SELECT
      amended_by_sfs,
      amendment_date,
      amendment_type,
      change_summary
    FROM statute_amendments
    WHERE target_document_id = ?
      AND target_provision_ref = ?
      AND amendment_date > ?
      AND amendment_date <= ?
    ORDER BY amendment_date
  `;

  const amendments_between = db.prepare(amendmentsQuery).all(
    sfs,
    provision_ref,
    date1,
    date2
  ) as AmendmentRecord[];

  return {
    version1,
    version2,
    changed,
    amendments_between,
  };
}

export class ProvisionNotFoundError extends Error {
  constructor(sfs: string, provision_ref: string) {
    super(`Provision ${provision_ref} not found in statute ${sfs}`);
    this.name = 'ProvisionNotFoundError';
  }
}

export class InvalidDateError extends Error {
  constructor(date: string) {
    super(`Invalid date format: ${date}. Expected YYYY-MM-DD.`);
    this.name = 'InvalidDateError';
  }
}

export class FutureProvisionError extends Error {
  constructor(sfs: string, provision_ref: string, earliest_date: string) {
    super(
      `Provision ${provision_ref} in statute ${sfs} was not yet enacted. ` +
      `First effective: ${earliest_date}.`
    );
    this.name = 'FutureProvisionError';
  }
}
