/**
 * validate_eu_compliance — Check Danish statute's EU compliance status.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface ValidateEUComplianceInput {
  document_id?: string;
  /** @deprecated Use document_id instead */
  sfs_number?: string;
  provision_ref?: string;
  eu_document_id?: string;
}

export interface EUComplianceResult {
  document_id: string;
  /** @deprecated Legacy alias for document_id */
  sfs_number: string;
  provision_ref?: string;
  compliance_status: 'compliant' | 'partial' | 'unclear' | 'not_applicable';
  eu_references_found: number;
  warnings: string[];
  outdated_references?: Array<{
    eu_document_id: string;
    title?: string;
    issue: string;
    replaced_by?: string;
  }>;
  recommendations?: string[];
}

/**
 * Validate EU compliance status for a Danish statute or provision.
 *
 * Phase 1: Basic validation checking for:
 * - References to repealed EU directives
 * - Missing implementation status
 * - Outdated references
 *
 * Future phases will include full compliance checking against EU requirements.
 */
export async function validateEUCompliance(
  db: Database,
  input: ValidateEUComplianceInput
): Promise<ToolResponse<EUComplianceResult>> {
  const documentId = input.document_id ?? input.sfs_number ?? '';

  // Validate document ID format
  if (!documentId || !/^\d{4}:\d+$/.test(documentId)) {
    throw new Error(`Invalid document ID format: "${documentId}". Expected format: "YYYY:NNN" (e.g., "2018:218")`);
  }

  // Check if statute exists
  const statute = db.prepare(`
    SELECT id, title, status
    FROM legal_documents
    WHERE id = ? AND type = 'statute'
  `).get(documentId) as { id: string; title: string; status: string } | undefined;

  if (!statute) {
    throw new Error(`Statute ${documentId} not found in database`);
  }

  let provisionId: number | null = null;
  if (input.provision_ref) {
    const provision = db.prepare(`
      SELECT id FROM legal_provisions
      WHERE document_id = ? AND provision_ref = ?
    `).get(documentId, input.provision_ref) as { id: number } | undefined;

    if (!provision) {
      throw new Error(
        `Provision ${documentId} ${input.provision_ref} not found in database`
      );
    }
    provisionId = provision.id;
  }

  // Get all EU references for this statute/provision
  let sql = `
    SELECT
      ed.id,
      ed.type,
      ed.title,
      ed.in_force,
      ed.amended_by,
      ed.repeals,
      er.reference_type,
      er.is_primary_implementation,
      er.implementation_status
    FROM eu_documents ed
    JOIN eu_references er ON ed.id = er.eu_document_id
    WHERE er.document_id = ?
  `;

  const params: (string | number)[] = [documentId];

  // Filter by provision if specified
  if (provisionId !== null) {
    sql += ` AND er.provision_id = ?`;
    params.push(provisionId);
  }

  // Filter by specific EU document if requested
  if (input.eu_document_id) {
    sql += ` AND ed.id = ?`;
    params.push(input.eu_document_id);
  }

  interface QueryRow {
    id: string;
    type: string;
    title: string | null;
    in_force: number;
    amended_by: string | null;
    repeals: string | null;
    reference_type: string;
    is_primary_implementation: number;
    implementation_status: string | null;
  }

  const rows = db.prepare(sql).all(...params) as QueryRow[];

  const warnings: string[] = [];
  const outdatedReferences: Array<{
    eu_document_id: string;
    title?: string;
    issue: string;
    replaced_by?: string;
  }> = [];
  const recommendations: string[] = [];

  // Analyze each EU reference
  for (const row of rows) {
    // Check if EU document is no longer in force
    if (row.in_force === 0) {
      const issue = `References repealed EU ${row.type} ${row.id}`;
      warnings.push(issue);

      const outdated: {
        eu_document_id: string;
        title?: string;
        issue: string;
        replaced_by?: string;
      } = {
        eu_document_id: row.id,
        issue,
      };

      if (row.title) outdated.title = row.title;

      // Check if there's a replacement
      if (row.amended_by) {
        try {
          const replacements = JSON.parse(row.amended_by) as string[];
          if (replacements.length > 0) {
            outdated.replaced_by = replacements[0];
            warnings.push(`  → Replaced by ${replacements[0]}`);
          }
        } catch {
          // Ignore JSON parse errors
        }
      }

      outdatedReferences.push(outdated);
    }

    // Check for missing implementation status
    if (row.is_primary_implementation === 1 && !row.implementation_status) {
      warnings.push(
        `Primary implementation of ${row.id} lacks implementation_status field`
      );
      recommendations.push(
        `Consider updating database with implementation_status for ${row.id}`
      );
    }

    // Check for unclear implementation status
    if (row.implementation_status === 'unknown' || row.implementation_status === 'pending') {
      warnings.push(`Implementation status for ${row.id} is "${row.implementation_status}"`);
    }
  }

  // Determine overall compliance status
  let complianceStatus: 'compliant' | 'partial' | 'unclear' | 'not_applicable';

  if (rows.length === 0) {
    complianceStatus = 'not_applicable';
    recommendations.push(
      'No EU references found for this statute. If this statute implements EU law, consider adding EU references to the database.'
    );
  } else if (outdatedReferences.length > 0) {
    complianceStatus = 'partial';
    recommendations.push(
      'Statute references repealed EU directives. Review whether Danish law has been updated to implement current EU requirements.'
    );
  } else if (warnings.length > 0) {
    complianceStatus = 'unclear';
  } else {
    complianceStatus = 'compliant';
  }

  const result: EUComplianceResult = {
    document_id: documentId,
    sfs_number: documentId,
    provision_ref: input.provision_ref,
    compliance_status: complianceStatus,
    eu_references_found: rows.length,
    warnings,
  };

  if (outdatedReferences.length > 0) {
    result.outdated_references = outdatedReferences;
  }

  if (recommendations.length > 0) {
    result.recommendations = recommendations;
  }

  return {
    results: result,
    _metadata: generateResponseMetadata(db),
  };
}
