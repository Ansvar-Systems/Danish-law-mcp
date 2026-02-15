/**
 * Validate citations against the database (zero-hallucination enforcer).
 *
 * This module ensures that every citation returned by the server
 * corresponds to an actual entry in the database.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import type { ValidationResult, ParsedCitation, DocumentStatus } from '../types/index.js';
import { parseCitation } from './parser.js';

interface DocumentRow {
  id: string;
  title: string;
  status: string;
}

interface ProvisionRow {
  id: number;
}

/**
 * Validate a citation string against the database.
 *
 * @param db - Database connection
 * @param citation - Raw citation string
 * @returns Validation result with existence checks and warnings
 */
export function validateCitation(db: Database, citation: string): ValidationResult {
  const parsed = parseCitation(citation);

  if (!parsed.valid) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [parsed.error || 'Invalid citation format'],
    };
  }

  return validateParsedCitation(db, parsed);
}

/**
 * Validate a pre-parsed citation against the database.
 */
export function validateParsedCitation(db: Database, parsed: ParsedCitation): ValidationResult {
  const warnings: string[] = [];

  // Check document existence
  const doc = db.prepare(
    'SELECT id, title, status FROM legal_documents WHERE id = ?'
  ).get(parsed.document_id) as DocumentRow | undefined;

  if (!doc) {
    return {
      citation: parsed,
      document_exists: false,
      provision_exists: false,
      warnings: [`Document "${parsed.document_id}" not found in database`],
    };
  }

  const status = doc.status as DocumentStatus;

  // Add warnings for non-standard statuses
  if (status === 'repealed') {
    warnings.push(`Document "${parsed.document_id}" has been repealed (upphävd)`);
  } else if (status === 'amended') {
    warnings.push(`Document "${parsed.document_id}" has been amended since ingestion`);
  }

  // Check provision existence if chapter/section specified
  let provisionExists = false;
  if (parsed.type === 'statute' && (parsed.chapter || parsed.section)) {
    const provisionRef = parsed.chapter && parsed.section
      ? `${parsed.chapter}:${parsed.section}`
      : parsed.section || '';

    if (provisionRef) {
      const prov = db.prepare(
        'SELECT id FROM legal_provisions WHERE document_id = ? AND provision_ref = ?'
      ).get(parsed.document_id, provisionRef) as ProvisionRow | undefined;

      provisionExists = !!prov;

      if (!provisionExists) {
        warnings.push(`Provision "${provisionRef}" not found in document "${parsed.document_id}"`);
      }
    }
  } else {
    // No provision reference requested, so provision check is N/A
    provisionExists = true;
  }

  return {
    citation: parsed,
    document_exists: true,
    provision_exists: provisionExists,
    status,
    document_title: doc.title,
    warnings,
  };
}
