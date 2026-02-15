#!/usr/bin/env tsx
/**
 * Lagen.nu Case Law Ingestion Script
 *
 * Fetches Swedish case law from lagen.nu's RDF dataset and ingests them
 * into the Swedish Legal Citation MCP server database.
 *
 * Pipeline:
 *   lagen.nu HTML feed -> fetch case IDs -> download RDF metadata ->
 *   parse RDF/XML -> insert into database.db
 *
 * Usage:
 *   tsx scripts/ingest-lagennu-cases.ts [--limit N]
 *
 * Examples:
 *   tsx scripts/ingest-lagennu-cases.ts           # Ingest all cases
 *   tsx scripts/ingest-lagennu-cases.ts --limit 100  # Ingest first 100 cases
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import Database from 'better-sqlite3';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const FEED_URL = 'https://lagen.nu/dataset/dv/feed';
const RDF_BASE_URL = 'https://lagen.nu/dom';
const REQUEST_DELAY_MS = 500;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 1000;
// Removed: BATCH_SIZE - now processing cases atomically one at a time
const USER_AGENT = 'Swedish-Law-MCP/0.1.0 (https://github.com/Ansvar-Systems/swedish-law-mcp)';

const DB_PATH = path.resolve(__dirname, '../data/database.db');
const LOG_DIR = path.resolve(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, 'ingest-lagennu.log');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CaseId {
  court: string;
  year: string;
  number: string;
  original: string;
}

interface CaseMetadata {
  document_id: string;
  title: string;
  court: string;
  case_number: string | null;
  decision_date: string | null;
  summary_snippet: string;
  keywords: string | null;
  cited_statutes: string[];
}

interface IngestionStats {
  total_fetched: number;
  inserted: number;
  updated: number;
  failed: number;
  skipped: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(message);

  ensureLogDir();
  fs.appendFileSync(LOG_FILE, logMessage);
}

function logError(message: string, error?: Error): void {
  const timestamp = new Date().toISOString();
  const errorDetails = error ? `\n  Error: ${error.message}\n  Stack: ${error.stack}` : '';
  const logMessage = `[${timestamp}] ERROR: ${message}${errorDetails}\n`;
  console.error(logMessage);

  ensureLogDir();
  fs.appendFileSync(LOG_FILE, logMessage);
}

// ─────────────────────────────────────────────────────────────────────────────
// Network utilities
// ─────────────────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string> {
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

      // Don't retry on 404 - the resource simply doesn't exist
      if (response.status === 404) {
        throw new Error(`HTTP 404: NOT FOUND (no retries)`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if it's a 404
      if (lastError.message.includes('404: NOT FOUND')) {
        throw lastError;
      }
      
      if (attempt < retries - 1) {
        log(`  Retry ${attempt + 1}/${retries - 1} for ${url}`);
      }
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
function parseCaseId(caseIdStr: string): CaseId | null {
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
async function fetchCaseIdsFromFeed(): Promise<CaseId[]> {
  log('Fetching case list from HTML feed...');
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

  log(`  Found ${caseIds.length} case IDs in feed`);
  return caseIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// RDF URL Construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert case ID to RDF URL
 * Examples:
 *   HFD 2023:1 -> https://lagen.nu/dom/hfd/2023:1.rdf
 *   AD 2023 nr 57 -> https://lagen.nu/dom/ad/2023:57.rdf
 *   MÖD 2023:12 -> https://lagen.nu/dom/mod/2023:12.rdf
 */
function caseIdToRdfUrl(caseId: CaseId): string {
  const courtCode = caseId.court.toLowerCase()
    .replace('möd', 'mod')
    .replace('mmd', 'mod');

  // AD uses "nr" format but RDF uses colon
  const reference = `${caseId.year}:${caseId.number}`;

  return `${RDF_BASE_URL}/${courtCode}/${reference}.rdf`;
}

/**
 * Generate document ID from case ID
 * Format: "HFD-2023:1", "AD-2023:57"
 */
function caseIdToDocumentId(caseId: CaseId): string {
  return `${caseId.court}-${caseId.year}:${caseId.number}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RDF/XML Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract text content from RDF element, handling various structures
 */
function extractRdfText(rdf: string, tagPattern: RegExp): string | null {
  const match = rdf.match(tagPattern);
  if (!match) return null;

  const content = match[1];
  // Remove XML tags and normalize whitespace
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

/**
 * Extract all matching text values from RDF (for multi-value fields)
 */
function extractRdfTextArray(rdf: string, tagPattern: RegExp): string[] {
  const matches = Array.from(rdf.matchAll(tagPattern));
  return matches
    .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(text => text.length > 0);
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
function parseRdfMetadata(rdf: string, caseId: CaseId): CaseMetadata | null {
  try {
    // Extract dcterms:identifier
    const identifier = extractRdfText(rdf, /<dcterms:identifier[^>]*>([^<]+)<\/dcterms:identifier>/i)
      || caseIdToDocumentId(caseId);

    // Extract title (prefer rpubl:referatrubrik, fallback to dcterms:title)
    let title = extractRdfText(rdf, /<rpubl:referatrubrik[^>]*>([^<]+)<\/rpubl:referatrubrik>/i)
      || extractRdfText(rdf, /<dcterms:title[^>]*>([^<]+)<\/dcterms:title>/i);

    if (!title) {
      // Use case ID as fallback title
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

    // Extract case number (rpubl:malnummer)
    const case_number = extractRdfText(rdf, /<rpubl:malnummer[^>]*>([^<]+)<\/rpubl:malnummer>/i);

    // Extract decision date (rpubl:avgorandedatum)
    const decision_date = extractRdfText(rdf, /<rpubl:avgorandedatum[^>]*>([^<]+)<\/rpubl:avgorandedatum>/i);

    // Create summary snippet (first 200 chars of referatrubrik or title)
    const summary_snippet = title.length > 200 ? title.substring(0, 197) + '...' : title;

    // Extract keywords from dcterms:subject > rdfs:label
    const subjectMatches = rdf.matchAll(/<dcterms:subject[^>]*>(.*?)<\/dcterms:subject>/gis);
    const keywords: string[] = [];
    for (const match of subjectMatches) {
      const label = extractRdfText(match[1], /<rdfs:label[^>]*>([^<]+)<\/rdfs:label>/i);
      if (label) {
        keywords.push(label);
      }
    }

    // Extract statute references from rpubl:lagrum and dcterms:references
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
      cited_statutes: Array.from(new Set(cited_statutes)), // Deduplicate
    };
  } catch (error) {
    logError(`Failed to parse RDF for ${caseId.original}`, error as Error);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Operations
// ─────────────────────────────────────────────────────────────────────────────

interface InsertResult {
  inserted: boolean;
  updated: boolean;
}

function insertOrUpdateCase(
  db: Database.Database,
  metadata: CaseMetadata,
  insertDoc: Database.Statement,
  insertCase: Database.Statement
): InsertResult {
  const result: InsertResult = { inserted: false, updated: false };

  try {
    // Check if document exists
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

      // Insert case_law metadata
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
    logError(`Failed to insert/update case ${metadata.document_id}`, error as Error);
    throw error;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Ingestion
// ─────────────────────────────────────────────────────────────────────────────

async function ingestCaseLaw(limit?: number): Promise<void> {
  log('Lagen.nu Case Law Ingestion');
  log(`  Database: ${DB_PATH}`);
  log(`  Limit: ${limit ? limit : 'none'}`);
  log('');

  // Verify database exists
  if (!fs.existsSync(DB_PATH)) {
    logError('Database not found. Run npm run build:db first.');
    process.exit(1);
  }

  // Open database
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // Prepared statements
  const insertDoc = db.prepare(`
    INSERT INTO legal_documents
      (id, type, title, title_en, short_name, status, issued_date, in_force_date, url, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCase = db.prepare(`
    INSERT INTO case_law
      (document_id, court, case_number, decision_date, summary, keywords)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET
      court = excluded.court,
      case_number = excluded.case_number,
      decision_date = excluded.decision_date,
      summary = excluded.summary,
      keywords = excluded.keywords
  `);

  const stats: IngestionStats = {
    total_fetched: 0,
    inserted: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
  };

  try {
    // Step 1: Fetch case IDs from HTML feed
    const caseIds = await fetchCaseIdsFromFeed();
    const casesToProcess = limit ? caseIds.slice(0, limit) : caseIds;

    log(`Processing ${casesToProcess.length} cases...`);
    log('');

    // Step 2: Process cases one at a time with atomic transactions
    for (let i = 0; i < casesToProcess.length; i++) {
      const caseId = casesToProcess[i];
      const rdfUrl = caseIdToRdfUrl(caseId);

      try {
        // Fetch RDF metadata
        const rdf = await fetchWithRetry(rdfUrl);
        stats.total_fetched++;

        // Parse RDF
        const metadata = parseRdfMetadata(rdf, caseId);

        if (!metadata) {
          stats.skipped++;
          log(`  [${i + 1}/${casesToProcess.length}] SKIPPED: ${caseId.original} (parse failed)`);
          continue;
        }

        // Insert/update in a single transaction per case
        const transaction = db.transaction(() => {
          const result = insertOrUpdateCase(db, metadata, insertDoc, insertCase);
          if (result.inserted) stats.inserted++;
          if (result.updated) stats.updated++;
        });
        
        try {
          transaction();
        } catch (dbError) {
          // Database operation failed - log and continue
          stats.failed++;
          logError(`Database error for ${caseId.original}`, dbError as Error);
          continue;
        }

        // Progress reporting every 50 cases
        if ((i + 1) % 50 === 0 || i === casesToProcess.length - 1) {
          log(`  [${i + 1}/${casesToProcess.length}] Processed ${caseId.original} ` +
              `(inserted: ${stats.inserted}, updated: ${stats.updated}, failed: ${stats.failed})`);
        }

        // Rate limiting
        if (i < casesToProcess.length - 1) {
          await delay(REQUEST_DELAY_MS);
        }
      } catch (error) {
        const err = error as Error;
        
        // Check if it's a 404 - don't count as failure, just skip
        if (err.message.includes('404: NOT FOUND')) {
          stats.skipped++;
          log(`  [${i + 1}/${casesToProcess.length}] SKIPPED: ${caseId.original} (not available on lagen.nu)`);
        } else {
          stats.failed++;
          logError(`Failed to process ${caseId.original}`, err);
        }
        
        continue;
      }
    }

    // Optimize database
    log('');
    log('Optimizing database...');
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.exec('ANALYZE');

  } finally {
    db.close();
  }

  // Final summary
  log('');
  log('═══════════════════════════════════════════════════════════════');
  log('Ingestion Complete');
  log('═══════════════════════════════════════════════════════════════');
  log(`  Total fetched:  ${stats.total_fetched}`);
  log(`  Inserted:       ${stats.inserted}`);
  log(`  Updated:        ${stats.updated}`);
  log(`  Failed:         ${stats.failed}`);
  log(`  Skipped:        ${stats.skipped}`);
  log('═══════════════════════════════════════════════════════════════');
  log(`  Log file: ${LOG_FILE}`);
  log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const isMainModule = process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  const args = process.argv.slice(2);
  let limit: number | undefined;

  // Parse --limit flag
  const limitIndex = args.indexOf('--limit');
  if (limitIndex >= 0 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
    if (isNaN(limit) || limit <= 0) {
      console.error('Error: --limit must be a positive number');
      process.exit(1);
    }
  }

  ingestCaseLaw(limit).catch(error => {
    logError('Ingestion failed', error);
    process.exit(1);
  });
}
