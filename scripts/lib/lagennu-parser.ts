/**
 * Shared utilities for lagen.nu case law parsing
 *
 * Used by both ingest-lagennu-cases.ts and sync-lagennu-cases.ts
 */

import Database from 'better-sqlite3';
import { JSDOM } from 'jsdom';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const FEED_URL = 'https://lagen.nu/dataset/dv/feed';
export const RDF_BASE_URL = 'https://lagen.nu/dom';
export const REQUEST_DELAY_MS = 500;
export const MAX_RETRIES = 3;
export const RETRY_BACKOFF_MS = 1000;
export const USER_AGENT = 'Swedish-Law-MCP/0.1.0 (https://github.com/Ansvar-Systems/swedish-law-mcp)';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CaseId {
  court: string;
  year: string;
  number: string;
  original: string;
}

export interface CaseMetadata {
  document_id: string;
  title: string;
  court: string;
  case_number: string | null;
  decision_date: string | null;
  summary_snippet: string;
  keywords: string | null;
  cited_statutes: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Network utilities
// ─────────────────────────────────────────────────────────────────────────────

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = RETRY_BACKOFF_MS * Math.pow(2, attempt - 1);
        await delay(backoff);
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/rdf+xml, text/html',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError || new Error('Unknown error');
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML Feed Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse case ID string into components
 * Formats: "HFD 2023:1", "AD 2023 nr 57", "NJA 2020 s. 45"
 */
export function parseCaseId(caseIdStr: string): CaseId | null {
  caseIdStr = caseIdStr.trim();

  // Pattern 1: "HFD 2023:1", "MÖD 2023:12"
  let match = caseIdStr.match(/^(HFD|MÖD|MMD|MIG|RH|NJA|HvS)\s+(\d{4}):(\d+)/i);
  if (match) {
    return {
      court: match[1].toUpperCase(),
      year: match[2],
      number: match[3],
      original: caseIdStr,
    };
  }

  // Pattern 2: "AD 2023 nr 57"
  match = caseIdStr.match(/^AD\s+(\d{4})\s+nr\s+(\d+)/i);
  if (match) {
    return {
      court: 'AD',
      year: match[1],
      number: match[2],
      original: caseIdStr,
    };
  }

  // Pattern 3: "NJA 2020 s. 45" (page-based reference)
  match = caseIdStr.match(/^(NJA|HFD)\s+(\d{4})\s+s\.\s*(\d+)/i);
  if (match) {
    return {
      court: match[1].toUpperCase(),
      year: match[2],
      number: match[3],
      original: caseIdStr,
    };
  }

  return null;
}

/**
 * Fetch and parse HTML feed to extract case IDs
 */
export async function fetchCaseIdsFromFeed(): Promise<CaseId[]> {
  const html = await fetchWithRetry(FEED_URL);

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const caseIds: CaseId[] = [];
  const links = document.querySelectorAll('a[href*="/dom/"]');

  for (const link of Array.from(links)) {
    const text = link.textContent?.trim();
    if (!text) continue;

    const parsed = parseCaseId(text);
    if (parsed) {
      caseIds.push(parsed);
    }
  }

  return caseIds;
}

/**
 * Extract decision date from case ID or metadata
 * Returns year from case ID as fallback
 */
export function extractDecisionDateFromCaseId(caseId: CaseId): string {
  return `${caseId.year}-01-01`; // Fallback to year start
}

// ─────────────────────────────────────────────────────────────────────────────
// RDF URL Construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert case ID to RDF URL
 * Examples:
 *   HFD 2023:1 -> https://lagen.nu/dom/hfd/2023:1.rdf
 *   AD 2023 nr 57 -> https://lagen.nu/dom/ad/2023:57.rdf
 *   NJA 2022 s. 45 -> https://lagen.nu/dom/nja/2022s45.rdf (page-based)
 */
export function caseIdToRdfUrl(caseId: CaseId): string {
  const courtCode = caseId.court.toLowerCase()
    .replace('möd', 'mod')
    .replace('mmd', 'mod');

  // NJA and HFD page-based references use "s" instead of ":"
  // Check if this is a page-based reference by looking at the original format
  let reference: string;
  if (caseId.original.includes(' s.') || caseId.original.includes(' s ')) {
    // Page-based reference: "NJA 2022 s. 45" -> "2022s45"
    reference = `${caseId.year}s${caseId.number}`;
  } else {
    // Colon-based reference: "HFD 2023:1" -> "2023:1"
    reference = `${caseId.year}:${caseId.number}`;
  }

  return `${RDF_BASE_URL}/${courtCode}/${reference}.rdf`;
}

/**
 * Generate document ID from case ID
 * Format: "HFD-2023:1", "AD-2023:57"
 */
export function caseIdToDocumentId(caseId: CaseId): string {
  return `${caseId.court}-${caseId.year}:${caseId.number}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RDF/XML Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract text content from RDF element
 */
function extractRdfText(rdf: string, tagPattern: RegExp): string | null {
  const match = rdf.match(tagPattern);
  if (!match) return null;

  const content = match[1];
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

/**
 * Extract resource URIs from RDF
 */
function extractRdfResources(rdf: string, tagName: string): string[] {
  const pattern = new RegExp(`<${tagName}[^>]*rdf:resource="([^"]+)"`, 'gi');
  const matches = Array.from(rdf.matchAll(pattern));
  return matches.map(m => m[1]);
}

/**
 * Convert statute URI to SFS number
 * Example: https://lagen.nu/2018:218 -> 2018:218
 */
function extractSfsFromUri(uri: string): string | null {
  const match = uri.match(/(\d{4}:\d+)/);
  return match ? match[1] : null;
}

/**
 * Parse RDF/XML document to extract case metadata
 */
export function parseRdfMetadata(rdf: string, caseId: CaseId): CaseMetadata | null {
  try {
    const identifier = extractRdfText(rdf, /<dcterms:identifier[^>]*>([^<]+)<\/dcterms:identifier>/i)
      || caseIdToDocumentId(caseId);

    let title = extractRdfText(rdf, /<rpubl:referatrubrik[^>]*>([^<]+)<\/rpubl:referatrubrik>/i)
      || extractRdfText(rdf, /<dcterms:title[^>]*>([^<]+)<\/dcterms:title>/i);

    if (!title) {
      title = caseId.original;
    }

    // Extract court from dcterms:publisher > foaf:name
    const publisherMatch = rdf.match(/<dcterms:publisher[^>]*>(.*?)<\/dcterms:publisher>/is);
    let court = caseId.court;
    if (publisherMatch) {
      const courtName = extractRdfText(publisherMatch[1], /<foaf:name[^>]*>([^<]+)<\/foaf:name>/i);
      if (courtName) {
        court = courtName;
      }
    }

    const case_number = extractRdfText(rdf, /<rpubl:malnummer[^>]*>([^<]+)<\/rpubl:malnummer>/i);
    const decision_date = extractRdfText(rdf, /<rpubl:avgorandedatum[^>]*>([^<]+)<\/rpubl:avgorandedatum>/i);

    const summary_snippet = title.length > 200 ? title.substring(0, 197) + '...' : title;

    // Extract keywords
    const subjectMatches = rdf.matchAll(/<dcterms:subject[^>]*>(.*?)<\/dcterms:subject>/gis);
    const keywords: string[] = [];
    for (const match of subjectMatches) {
      const label = extractRdfText(match[1], /<rdfs:label[^>]*>([^<]+)<\/rdfs:label>/i);
      if (label) {
        keywords.push(label);
      }
    }

    // Extract statute references
    const lagrumUris = extractRdfResources(rdf, 'rpubl:lagrum');
    const referenceUris = extractRdfResources(rdf, 'dcterms:references');
    const allUris = [...lagrumUris, ...referenceUris];

    const cited_statutes = allUris
      .map(uri => extractSfsFromUri(uri))
      .filter((sfs): sfs is string => sfs !== null);

    return {
      document_id: identifier,
      title,
      court,
      case_number,
      decision_date,
      summary_snippet,
      keywords: keywords.length > 0 ? keywords.join(', ') : null,
      cited_statutes: Array.from(new Set(cited_statutes)),
    };
  } catch (error) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Operations
// ─────────────────────────────────────────────────────────────────────────────

export interface InsertResult {
  inserted: boolean;
  updated: boolean;
}

/**
 * Insert or update a case in the database
 */
export function insertOrUpdateCase(
  db: Database.Database,
  metadata: CaseMetadata,
  insertDoc: Database.Statement,
  insertCase: Database.Statement
): InsertResult {
  const result: InsertResult = { inserted: false, updated: false };

  try {
    const existingDoc = db.prepare('SELECT id FROM legal_documents WHERE id = ?')
      .get(metadata.document_id);

    if (existingDoc) {
      // Update existing document
      db.prepare(`
        UPDATE legal_documents
        SET title = ?, type = 'case_law', status = 'in_force',
            last_updated = datetime('now')
        WHERE id = ?
      `).run(metadata.title, metadata.document_id);

      // Update case_law table
      db.prepare(`
        UPDATE case_law
        SET court = ?, case_number = ?, decision_date = ?,
            summary = ?, keywords = ?
        WHERE document_id = ?
      `).run(
        metadata.court,
        metadata.case_number,
        metadata.decision_date,
        metadata.summary_snippet,
        metadata.keywords,
        metadata.document_id
      );

      result.updated = true;
    } else {
      // Insert new document
      insertDoc.run(
        metadata.document_id,
        'case_law',
        metadata.title,
        null, // title_en
        null, // short_name
        'in_force',
        metadata.decision_date,
        null, // in_force_date
        `https://lagen.nu/dom/${metadata.document_id.toLowerCase().replace('-', '/')}`,
        null  // description
      );

      insertCase.run(
        metadata.document_id,
        metadata.court,
        metadata.case_number,
        metadata.decision_date,
        metadata.summary_snippet,
        metadata.keywords
      );

      result.inserted = true;
    }

    // Insert statute references as cross-references
    // Only insert if the target statute exists in the database
    if (metadata.cited_statutes.length > 0) {
      const checkStatute = db.prepare(`
        SELECT id FROM legal_documents WHERE id = ? AND type = 'statute'
      `);

      const insertXref = db.prepare(`
        INSERT OR IGNORE INTO cross_references
          (source_document_id, target_document_id, ref_type)
        VALUES (?, ?, 'references')
      `);

      for (const sfs of metadata.cited_statutes) {
        // Only insert cross-reference if target statute exists
        const exists = checkStatute.get(sfs);
        if (exists) {
          insertXref.run(metadata.document_id, sfs);
        }
      }
    }
  } catch (error) {
    throw error;
  }

  return result;
}

/**
 * Fetch RDF metadata for a case
 */
export async function fetchCaseRdf(caseId: CaseId): Promise<string> {
  const rdfUrl = caseIdToRdfUrl(caseId);
  return await fetchWithRetry(rdfUrl);
}
