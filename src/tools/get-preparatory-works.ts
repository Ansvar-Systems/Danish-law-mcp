/**
 * get_preparatory_works — Retrieve preparatory works (forarbeten) for a statute.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface GetPreparatoryWorksInput {
  document_id: string;
}

export interface PreparatoryWorkResult {
  statute_id: string;
  statute_title: string;
  prep_document_id: string;
  prep_type: string;
  prep_title: string;
  summary: string | null;
  issued_date: string | null;
  url: string | null;
}

export async function getPreparatoryWorks(
  db: Database,
  input: GetPreparatoryWorksInput
): Promise<ToolResponse<PreparatoryWorkResult[]>> {
  if (!input.document_id) {
    throw new Error('document_id is required');
  }

  const sql = `
    SELECT
      pw.statute_id,
      statute.title as statute_title,
      pw.prep_document_id,
      prep.type as prep_type,
      COALESCE(pw.title, prep.title) as prep_title,
      pw.summary,
      prep.issued_date,
      prep.url
    FROM preparatory_works pw
    JOIN legal_documents statute ON statute.id = pw.statute_id
    JOIN legal_documents prep ON prep.id = pw.prep_document_id
    WHERE pw.statute_id = ?
    ORDER BY prep.issued_date
  `;

  const results = db.prepare(sql).all(input.document_id) as PreparatoryWorkResult[];

  return {
    results,
    _metadata: generateResponseMetadata(db)
  };
}
