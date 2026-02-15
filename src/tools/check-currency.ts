/**
 * check_currency — Check if a statute or provision is current (in force).
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { extractRepealDateFromDescription, normalizeAsOfDate } from '../utils/as-of-date.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface CheckCurrencyInput {
  document_id: string;
  provision_ref?: string;
  as_of_date?: string;
}

export interface CaseLawStats {
  last_updated: string;
  total_cases: number;
  source: string;
  source_url: string;
  attribution: string;
}

export interface CurrencyResult {
  document_id: string;
  title: string;
  status: string;
  type: string;
  issued_date: string | null;
  in_force_date: string | null;
  last_updated: string | null;
  is_current: boolean;
  as_of_date?: string;
  status_as_of?: 'in_force' | 'repealed' | 'not_yet_in_force';
  is_in_force_as_of?: boolean;
  provision_exists?: boolean;
  warnings: string[];
  case_law_stats?: CaseLawStats;
}

interface DocumentRow {
  id: string;
  title: string;
  status: string;
  type: string;
  issued_date: string | null;
  in_force_date: string | null;
  description: string | null;
  last_updated: string | null;
}

export async function checkCurrency(
  db: Database,
  input: CheckCurrencyInput
): Promise<ToolResponse<CurrencyResult | null>> {
  if (!input.document_id) {
    throw new Error('document_id is required');
  }

  const doc = db.prepare(`
    SELECT id, title, status, type, issued_date, in_force_date, description, last_updated
    FROM legal_documents
    WHERE id = ?
  `).get(input.document_id) as DocumentRow | undefined;

  if (!doc) {
    return {
      results: null,
      _metadata: generateResponseMetadata(db)
    };
  }

  const warnings: string[] = [];
  const isCurrent = doc.status === 'in_force';
  const asOfDate = normalizeAsOfDate(input.as_of_date);
  const repealDate = extractRepealDateFromDescription(doc.description ?? null);

  if (doc.status === 'repealed') {
    warnings.push('This statute has been repealed (upphävd)');
  } else if (doc.status === 'amended') {
    warnings.push('This statute has been amended since last ingestion');
  } else if (doc.status === 'not_yet_in_force') {
    warnings.push('This statute has not yet entered into force');
  }

  let statusAsOf: 'in_force' | 'repealed' | 'not_yet_in_force' | undefined;
  let isInForceAsOf: boolean | undefined;
  if (asOfDate) {
    const validFrom = doc.in_force_date ?? doc.issued_date;
    const started = validFrom == null || validFrom <= asOfDate;
    const ended = repealDate != null && repealDate <= asOfDate;
    statusAsOf = !started ? 'not_yet_in_force' : ended ? 'repealed' : 'in_force';
    isInForceAsOf = statusAsOf === 'in_force';
    warnings.push(
      'Historical lookups use provision validity windows where available; some statutes only have current consolidated wording.'
    );
  }

  let provisionExists: boolean | undefined;
  if (input.provision_ref) {
    const prov = asOfDate
      ? db.prepare(`
        SELECT 1
        FROM legal_provision_versions
        WHERE document_id = ?
          AND provision_ref = ?
          AND (valid_from IS NULL OR valid_from <= ?)
          AND (valid_to IS NULL OR valid_to > ?)
        LIMIT 1
      `).get(input.document_id, input.provision_ref, asOfDate, asOfDate)
      : db.prepare(
        'SELECT 1 FROM legal_provisions WHERE document_id = ? AND provision_ref = ?'
      ).get(input.document_id, input.provision_ref);
    provisionExists = !!prov;

    if (!provisionExists) {
      warnings.push(`Provision "${input.provision_ref}" not found in this document`);
    }
  }

  // Get case law statistics if the sync metadata table exists
  let caseLawStats: CaseLawStats | undefined;
  try {
    const syncMeta = db.prepare(`
      SELECT last_sync_date, cases_count, source
      FROM case_law_sync_metadata
      WHERE id = 1
    `).get() as { last_sync_date: string; cases_count: number; source: string } | undefined;

    if (syncMeta) {
      caseLawStats = {
        last_updated: syncMeta.last_sync_date,
        total_cases: syncMeta.cases_count || 0,
        source: syncMeta.source || 'lagen.nu',
        source_url: 'https://lagen.nu',
        attribution: 'Case law data from lagen.nu, licensed CC-BY Domstolsverket',
      };
    }
  } catch (error) {
    // Table doesn't exist or query failed - silently skip
  }

  return {
    results: {
      document_id: doc.id,
      title: doc.title,
      status: doc.status,
      type: doc.type,
      issued_date: doc.issued_date,
      in_force_date: doc.in_force_date,
      last_updated: doc.last_updated,
      is_current: isCurrent,
      as_of_date: asOfDate,
      status_as_of: statusAsOf,
      is_in_force_as_of: isInForceAsOf,
      provision_exists: provisionExists,
      warnings,
      case_law_stats: caseLawStats,
    },
    _metadata: generateResponseMetadata(db)
  };
}
