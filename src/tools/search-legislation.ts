/**
 * search_legislation — Full-text search across Danish statute provisions.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariants } from '../utils/fts-query.js';
import { normalizeAsOfDate } from '../utils/as-of-date.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface SearchLegislationInput {
  query: string;
  document_id?: string;
  status?: string;
  as_of_date?: string;
  limit?: number;
}

export interface SearchLegislationResult {
  document_id: string;
  document_title: string;
  provision_ref: string;
  chapter: string | null;
  section: string;
  title: string | null;
  snippet: string;
  relevance: number;
  valid_from?: string | null;
  valid_to?: string | null;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function searchLegislation(
  db: Database,
  input: SearchLegislationInput
): Promise<ToolResponse<SearchLegislationResult[]>> {
  if (!input.query || input.query.trim().length === 0) {
    return {
      results: [],
      _metadata: generateResponseMetadata(db)
    };
  }

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const queryVariants = buildFtsQueryVariants(input.query);
  const asOfDate = normalizeAsOfDate(input.as_of_date);

  let sql = '';

  const params: (string | number)[] = [];

  if (asOfDate) {
    sql = `
      WITH ranked_versions AS (
        SELECT
          lpv.document_id,
          ld.title as document_title,
          lpv.provision_ref,
          lpv.chapter,
          lpv.section,
          lpv.title,
          lpv.valid_from,
          lpv.valid_to,
          substr(lpv.content, 1, 320) as snippet,
          0.0 as relevance,
          row_number() OVER (
            PARTITION BY lpv.document_id, lpv.provision_ref
            ORDER BY COALESCE(lpv.valid_from, '0000-01-01') DESC, lpv.id DESC
          ) as version_rank
        FROM provision_versions_fts
        JOIN legal_provision_versions lpv ON lpv.id = provision_versions_fts.rowid
        JOIN legal_documents ld ON ld.id = lpv.document_id
        WHERE provision_versions_fts MATCH ?
          AND (lpv.valid_from IS NULL OR lpv.valid_from <= ?)
          AND (lpv.valid_to IS NULL OR lpv.valid_to > ?)
    `;
    params.push(asOfDate, asOfDate);

    if (input.document_id) {
      sql += ` AND lpv.document_id = ?`;
      params.push(input.document_id);
    }

    if (input.status) {
      sql += ` AND ld.status = ?`;
      params.push(input.status);
    }

    sql += `
      )
      SELECT
        document_id,
        document_title,
        provision_ref,
        chapter,
        section,
        title,
        snippet,
        relevance,
        valid_from,
        valid_to
      FROM ranked_versions
      WHERE version_rank = 1
      ORDER BY relevance
      LIMIT ?
    `;
  } else {
    sql = `
      SELECT
        lp.document_id,
        ld.title as document_title,
        lp.provision_ref,
        lp.chapter,
        lp.section,
        lp.title,
        snippet(provisions_fts, 0, '>>>', '<<<', '...', 32) as snippet,
        bm25(provisions_fts) as relevance,
        NULL as valid_from,
        NULL as valid_to
      FROM provisions_fts
      JOIN legal_provisions lp ON lp.id = provisions_fts.rowid
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE provisions_fts MATCH ?
    `;

    if (input.document_id) {
      sql += ` AND lp.document_id = ?`;
      params.push(input.document_id);
    }

    if (input.status) {
      sql += ` AND ld.status = ?`;
      params.push(input.status);
    }

    sql += ` ORDER BY relevance LIMIT ?`;
  }

  params.push(limit);

  const runQuery = (ftsQuery: string): SearchLegislationResult[] => {
    const bound = [ftsQuery, ...params];
    return db.prepare(sql).all(...bound) as SearchLegislationResult[];
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
