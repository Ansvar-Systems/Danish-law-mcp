/**
 * search_eu_implementations — Search for EU directives/regulations by keyword.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface SearchEUImplementationsInput {
  query?: string;
  type?: 'directive' | 'regulation';
  year_from?: number;
  year_to?: number;
  community?: 'EU' | 'EG' | 'EEG' | 'Euratom';
  has_danish_implementation?: boolean;
  /** @deprecated Use has_danish_implementation instead */
  has_swedish_implementation?: boolean;
  limit?: number;
}

export interface SearchEUImplementationsResult {
  results: Array<{
    eu_document: {
      id: string;
      type: 'directive' | 'regulation';
      year: number;
      number: number;
      title?: string;
      short_name?: string;
      community: string;
      celex_number?: string;
    };
    danish_statute_count: number;
    /** @deprecated Legacy alias for danish_statute_count */
    swedish_statute_count: number;
    primary_implementations: string[];
    all_references: string[];
  }>;
  total_results: number;
  query_info: SearchEUImplementationsInput;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Search for EU directives/regulations with Danish implementation information.
 *
 * Supports filtering by type, year range, community, and keyword search.
 */
export async function searchEUImplementations(
  db: Database,
  input: SearchEUImplementationsInput
): Promise<ToolResponse<SearchEUImplementationsResult>> {
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  // Build search query
  let sql = `
    SELECT
      ed.id,
      ed.type,
      ed.year,
      ed.number,
      ed.title,
      ed.short_name,
      ed.community,
      ed.celex_number,
      COUNT(DISTINCT er.document_id) AS danish_statute_count,
      GROUP_CONCAT(DISTINCT CASE WHEN er.is_primary_implementation = 1 THEN er.document_id END) AS primary_implementations,
      GROUP_CONCAT(DISTINCT er.document_id) AS all_references
    FROM eu_documents ed
    LEFT JOIN eu_references er ON ed.id = er.eu_document_id
    WHERE 1=1
  `;

  const params: (string | number)[] = [];

  // Text search on title, short_name, or CELEX
  if (input.query && input.query.trim()) {
    const searchTerm = `%${input.query.trim()}%`;
    sql += ` AND (
      ed.title LIKE ? OR
      ed.title_sv LIKE ? OR
      ed.short_name LIKE ? OR
      ed.celex_number LIKE ? OR
      ed.description LIKE ?
    )`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
  }

  // Filter by type
  if (input.type) {
    sql += ` AND ed.type = ?`;
    params.push(input.type);
  }

  // Filter by year range
  if (input.year_from) {
    sql += ` AND ed.year >= ?`;
    params.push(input.year_from);
  }
  if (input.year_to) {
    sql += ` AND ed.year <= ?`;
    params.push(input.year_to);
  }

  // Filter by community
  if (input.community) {
    sql += ` AND ed.community = ?`;
    params.push(input.community);
  }

  sql += ` GROUP BY ed.id`;

  // Filter by Danish implementation existence
  const hasImplementation =
    input.has_danish_implementation ?? input.has_swedish_implementation;

  if (hasImplementation !== undefined) {
    if (hasImplementation) {
      sql += ` HAVING danish_statute_count > 0`;
    } else {
      sql += ` HAVING danish_statute_count = 0`;
    }
  }

  sql += `
    ORDER BY ed.year DESC, ed.number DESC
    LIMIT ?
  `;
  params.push(limit);

  interface QueryRow {
    id: string;
    type: 'directive' | 'regulation';
    year: number;
    number: number;
    title: string | null;
    short_name: string | null;
    community: string;
    celex_number: string | null;
    danish_statute_count: number;
    primary_implementations: string | null;
    all_references: string | null;
  }

  const rows = db.prepare(sql).all(...params) as QueryRow[];

  // Transform results
  const results = rows.map(row => ({
    eu_document: {
      id: row.id,
      type: row.type,
      year: row.year,
      number: row.number,
      title: row.title || undefined,
      short_name: row.short_name || undefined,
      community: row.community,
      celex_number: row.celex_number || undefined,
    },
    danish_statute_count: row.danish_statute_count,
    swedish_statute_count: row.danish_statute_count,
    primary_implementations: row.primary_implementations
      ? row.primary_implementations.split(',').filter(s => s)
      : [],
    all_references: row.all_references
      ? row.all_references.split(',').filter(s => s)
      : [],
  }));

  return {
    results: {
      results,
      total_results: results.length,
      query_info: input,
    },
    _metadata: generateResponseMetadata(db),
  };
}
