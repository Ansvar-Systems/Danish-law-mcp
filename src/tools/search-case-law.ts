/**
 * search_case_law — Full-text search across Swedish court decisions.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariants } from '../utils/fts-query.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface SearchCaseLawInput {
  query: string;
  court?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export interface CaseLawResult {
  document_id: string;
  title: string;
  court: string;
  case_number: string | null;
  decision_date: string | null;
  summary_snippet: string;
  keywords: string | null;
  relevance: number;
  _metadata: {
    source: string;
    attribution: string;
  };
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function searchCaseLaw(
  db: Database,
  input: SearchCaseLawInput
): Promise<ToolResponse<CaseLawResult[]>> {
  if (!input.query || input.query.trim().length === 0) {
    return {
      results: [],
      _metadata: generateResponseMetadata(db)
    };
  }

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const queryVariants = buildFtsQueryVariants(input.query);

  let sql = `
    SELECT
      cl.document_id,
      ld.title,
      cl.court,
      cl.case_number,
      cl.decision_date,
      snippet(case_law_fts, 0, '>>>', '<<<', '...', 32) as summary_snippet,
      cl.keywords,
      bm25(case_law_fts) as relevance
    FROM case_law_fts
    JOIN case_law cl ON cl.id = case_law_fts.rowid
    JOIN legal_documents ld ON ld.id = cl.document_id
    WHERE case_law_fts MATCH ?
  `;

  const params: (string | number)[] = [];

  if (input.court) {
    sql += ` AND cl.court = ?`;
    params.push(input.court);
  }

  if (input.date_from) {
    sql += ` AND cl.decision_date >= ?`;
    params.push(input.date_from);
  }

  if (input.date_to) {
    sql += ` AND cl.decision_date <= ?`;
    params.push(input.date_to);
  }

  sql += ` ORDER BY relevance LIMIT ?`;
  params.push(limit);

  const runQuery = (ftsQuery: string): CaseLawResult[] => {
    const bound = [ftsQuery, ...params];
    const results = db.prepare(sql).all(...bound) as Omit<CaseLawResult, '_metadata'>[];

    // Add attribution metadata to each result
    return results.map(result => ({
      ...result,
      _metadata: {
        source: 'lagen.nu',
        attribution: 'Data from lagen.nu, licensed CC-BY Domstolsverket',
      },
    }));
  };

  const primaryResults = runQuery(queryVariants.primary);
  const results = (primaryResults.length > 0 || !queryVariants.fallback)
    ? primaryResults
    : runQuery(queryVariants.fallback);

  return {
    results,
    _metadata: generateResponseMetadata(db)
  };
}
