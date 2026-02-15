/**
 * get_swedish_implementations — Find Danish statutes implementing an EU directive/regulation.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import type { EUDocument, SwedishImplementation } from '../types/index.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetSwedishImplementationsInput {
  eu_document_id: string;
  primary_only?: boolean;
  in_force_only?: boolean;
}

export interface GetSwedishImplementationsResult {
  eu_document: {
    id: string;
    type: 'directive' | 'regulation';
    year: number;
    number: number;
    title?: string;
    short_name?: string;
    celex_number?: string;
  };
  implementations: SwedishImplementation[];
  statistics: {
    total_statutes: number;
    primary_implementations: number;
    in_force: number;
    repealed: number;
  };
}

/**
 * Find Danish statutes that implement or reference a specific EU directive or regulation.
 *
 * Returns a list of Danish statutes with their reference types and implementation status.
 */
export async function getSwedishImplementations(
  db: Database,
  input: GetSwedishImplementationsInput
): Promise<ToolResponse<GetSwedishImplementationsResult>> {
  // Validate EU document ID format
  if (!input.eu_document_id || !/^(directive|regulation):\d+\/\d+$/.test(input.eu_document_id)) {
    throw new Error(
      `Invalid EU document ID format: "${input.eu_document_id}". Expected format: "directive:YYYY/NNN" or "regulation:YYYY/NNN" (e.g., "regulation:2016/679")`
    );
  }

  // Check if EU document exists
  const euDoc = db.prepare(`
    SELECT id, type, year, number, title, short_name, celex_number
    FROM eu_documents
    WHERE id = ?
  `).get(input.eu_document_id) as EUDocument | undefined;

  if (!euDoc) {
    throw new Error(`EU document ${input.eu_document_id} not found in database`);
  }

  // Build query for Danish implementations
  let sql = `
    SELECT
      ld.id AS document_id,
      ld.title AS document_title,
      ld.short_name AS document_short_name,
      ld.status,
      er.reference_type,
      er.is_primary_implementation,
      er.implementation_status,
      GROUP_CONCAT(DISTINCT er.eu_article) AS articles_referenced
    FROM legal_documents ld
    JOIN eu_references er ON ld.id = er.document_id
    WHERE er.eu_document_id = ?
  `;

  const params: (string | number)[] = [input.eu_document_id];

  // Filter by primary implementations only
  if (input.primary_only) {
    sql += ` AND er.is_primary_implementation = 1`;
  }

  // Filter by in-force statutes only
  if (input.in_force_only) {
    sql += ` AND ld.status = 'in_force'`;
  }

  sql += `
    GROUP BY ld.id
    ORDER BY er.is_primary_implementation DESC, ld.id
  `;

  interface QueryRow {
    document_id: string;
    document_title: string;
    document_short_name: string | null;
    status: string;
    reference_type: string;
    is_primary_implementation: number;
    implementation_status: string | null;
    articles_referenced: string | null;
  }

  const rows = db.prepare(sql).all(...params) as QueryRow[];

  // Transform rows into result format
  const implementations: SwedishImplementation[] = rows.map(row => {
    const impl: SwedishImplementation = {
      document_id: row.document_id,
      document_title: row.document_title,
      sfs_number: row.document_id,
      sfs_title: row.document_title,
      status: row.status,
      reference_type: row.reference_type as any,
      is_primary_implementation: row.is_primary_implementation === 1,
    };

    if (row.document_short_name) impl.short_name = row.document_short_name;
    if (row.implementation_status) impl.implementation_status = row.implementation_status as any;
    if (row.articles_referenced) {
      impl.articles_referenced = row.articles_referenced.split(',').filter(a => a && a.trim());
    }

    return impl;
  });

  // Calculate statistics
  const primaryCount = implementations.filter(i => i.is_primary_implementation).length;
  const inForceCount = implementations.filter(i => i.status === 'in_force').length;
  const repealedCount = implementations.filter(i => i.status === 'repealed').length;

  const result: GetSwedishImplementationsResult = {
    eu_document: {
      id: euDoc.id,
      type: euDoc.type,
      year: euDoc.year,
      number: euDoc.number,
      title: euDoc.title,
      short_name: euDoc.short_name,
      celex_number: euDoc.celex_number,
    },
    implementations,
    statistics: {
      total_statutes: implementations.length,
      primary_implementations: primaryCount,
      in_force: inForceCount,
      repealed: repealedCount,
    },
  };

  return {
    results: result,
    _metadata: generateResponseMetadata(db),
  };
}

// Danish aliases keep runtime parity while exposing country-specific naming.
export type GetDanishImplementationsInput = GetSwedishImplementationsInput;
export type GetDanishImplementationsResult = GetSwedishImplementationsResult;
export const getDanishImplementations = getSwedishImplementations;
