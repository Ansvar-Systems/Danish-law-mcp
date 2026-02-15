/**
 * build_legal_stance — Aggregate citations from multiple sources for a legal question.
 *
 * Searches across statutes, case law, and preparatory works to build
 * a comprehensive set of citations relevant to a legal topic.
 */

import type { Database } from '@ansvar/mcp-sqlite';
import { buildFtsQueryVariants } from '../utils/fts-query.js';
import { normalizeAsOfDate } from '../utils/as-of-date.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface BuildLegalStanceInput {
  query: string;
  document_id?: string;
  include_case_law?: boolean;
  include_preparatory_works?: boolean;
  as_of_date?: string;
  limit?: number;
}

interface ProvisionHit {
  document_id: string;
  document_title: string;
  provision_ref: string;
  title: string | null;
  snippet: string;
  relevance: number;
}

interface CaseLawHit {
  document_id: string;
  title: string;
  court: string;
  decision_date: string | null;
  summary_snippet: string;
  relevance: number;
}

interface PrepWorkHit {
  statute_id: string;
  prep_document_id: string;
  title: string | null;
  summary_snippet: string;
  relevance: number;
}

export interface LegalStanceResult {
  query: string;
  provisions: ProvisionHit[];
  case_law: CaseLawHit[];
  preparatory_works: PrepWorkHit[];
  total_citations: number;
  as_of_date?: string;
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export async function buildLegalStance(
  db: Database,
  input: BuildLegalStanceInput
): Promise<ToolResponse<LegalStanceResult>> {
  if (!input.query || input.query.trim().length === 0) {
    return {
      results: { query: '', provisions: [], case_law: [], preparatory_works: [], total_citations: 0 },
      _metadata: generateResponseMetadata(db)
    };
  }

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const queryVariants = buildFtsQueryVariants(input.query);
  const includeCaseLaw = input.include_case_law !== false;
  const includePrepWorks = input.include_preparatory_works !== false;
  const asOfDate = normalizeAsOfDate(input.as_of_date);

  // Search provisions
  let provSql = '';
  const provParams: (string | number)[] = [];

  if (asOfDate) {
    provSql = `
      WITH ranked_versions AS (
        SELECT
          lpv.document_id,
          ld.title as document_title,
          lpv.provision_ref,
          lpv.title,
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
    provParams.push(asOfDate, asOfDate);

    if (input.document_id) {
      provSql += ` AND lpv.document_id = ?`;
      provParams.push(input.document_id);
    }

    provSql += `
      )
      SELECT
        document_id,
        document_title,
        provision_ref,
        title,
        snippet,
        relevance
      FROM ranked_versions
      WHERE version_rank = 1
      ORDER BY relevance LIMIT ?
    `;
  } else {
    provSql = `
      SELECT
        lp.document_id,
        ld.title as document_title,
        lp.provision_ref,
        lp.title,
        snippet(provisions_fts, 0, '>>>', '<<<', '...', 32) as snippet,
        bm25(provisions_fts) as relevance
      FROM provisions_fts
      JOIN legal_provisions lp ON lp.id = provisions_fts.rowid
      JOIN legal_documents ld ON ld.id = lp.document_id
      WHERE provisions_fts MATCH ?
    `;

    if (input.document_id) {
      provSql += ` AND lp.document_id = ?`;
      provParams.push(input.document_id);
    }

    provSql += ` ORDER BY relevance LIMIT ?`;
  }
  provParams.push(limit);

  const runProvisionQuery = (ftsQuery: string): ProvisionHit[] => {
    const bound = [ftsQuery, ...provParams];
    return db.prepare(provSql).all(...bound) as ProvisionHit[];
  };
  let provisions = runProvisionQuery(queryVariants.primary);
  if (provisions.length === 0 && queryVariants.fallback) {
    provisions = runProvisionQuery(queryVariants.fallback);
  }

  // Search case law
  let caseLaw: CaseLawHit[] = [];
  if (includeCaseLaw) {
    let clSql = `
      SELECT
        cl.document_id,
        ld.title,
        cl.court,
        cl.decision_date,
        snippet(case_law_fts, 0, '>>>', '<<<', '...', 32) as summary_snippet,
        bm25(case_law_fts) as relevance
      FROM case_law_fts
      JOIN case_law cl ON cl.id = case_law_fts.rowid
      JOIN legal_documents ld ON ld.id = cl.document_id
      WHERE case_law_fts MATCH ?
    `;
    const clParams: (string | number)[] = [];
    if (asOfDate) {
      clSql += ` AND (cl.decision_date IS NULL OR cl.decision_date <= ?)`;
      clParams.push(asOfDate);
    }
    clSql += ` ORDER BY relevance LIMIT ?`;
    clParams.push(limit);

    const runCaseLawQuery = (ftsQuery: string): CaseLawHit[] =>
      db.prepare(clSql).all(ftsQuery, ...clParams) as CaseLawHit[];

    caseLaw = runCaseLawQuery(queryVariants.primary);
    if (caseLaw.length === 0 && queryVariants.fallback) {
      caseLaw = runCaseLawQuery(queryVariants.fallback);
    }
  }

  // Search preparatory works
  let prepWorks: PrepWorkHit[] = [];
  if (includePrepWorks) {
    let pwSql = `
      SELECT
        pw.statute_id,
        pw.prep_document_id,
        pw.title,
        snippet(prep_works_fts, 1, '>>>', '<<<', '...', 32) as summary_snippet,
        bm25(prep_works_fts) as relevance
      FROM prep_works_fts
      JOIN preparatory_works pw ON pw.id = prep_works_fts.rowid
      JOIN legal_documents prep_doc ON prep_doc.id = pw.prep_document_id
      WHERE prep_works_fts MATCH ?
    `;
    const pwParams: (string | number)[] = [];
    if (asOfDate) {
      pwSql += ` AND (prep_doc.issued_date IS NULL OR prep_doc.issued_date <= ?)`;
      pwParams.push(asOfDate);
    }
    pwSql += ` ORDER BY relevance LIMIT ?`;
    pwParams.push(limit);
    const runPrepQuery = (ftsQuery: string): PrepWorkHit[] =>
      db.prepare(pwSql).all(ftsQuery, ...pwParams) as PrepWorkHit[];

    prepWorks = runPrepQuery(queryVariants.primary);
    if (prepWorks.length === 0 && queryVariants.fallback) {
      prepWorks = runPrepQuery(queryVariants.fallback);
    }
  }

  return {
    results: {
      query: input.query,
      provisions,
      case_law: caseLaw,
      preparatory_works: prepWorks,
      total_citations: provisions.length + caseLaw.length + prepWorks.length,
      as_of_date: asOfDate,
    },
    _metadata: generateResponseMetadata(db)
  };
}
