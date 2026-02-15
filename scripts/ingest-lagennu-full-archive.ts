#!/usr/bin/env tsx
/**
 * Lagen.nu Full Archive Scraper
 *
 * Fetches Swedish case law from lagen.nu's complete court archives by
 * systematically scraping year-based dataset pages for all major courts.
 *
 * This significantly expands coverage beyond the HTML feed, which only
 * shows ~150 recent cases.
 *
 * Court Archives Scraped:
 *   - HFD (Högsta förvaltningsdomstolen) - Supreme Administrative Court
 *   - HD/NJA (Högsta domstolen) - Supreme Court
 *   - AD (Arbetsdomstolen) - Labour Court
 *   - MÖD (Mark- och miljööverdomstolen) - Environmental Court
 *   - MIG (Migrationsöverdomstolen) - Migration Court of Appeal
 *   - RH (Rättsfall från hovrätterna) - Courts of Appeal
 *   - PMÖD (Patent- och marknadsöverdomstolen) - Patent and Market Court of Appeal
 *
 * Strategy:
 *   1. For each court, iterate through years (per-court start year to current)
 *   2. Fetch dataset page: https://lagen.nu/dataset/dv?hfd=2023
 *   3. Extract all case links from the page
 *   4. Fetch RDF metadata for each case
 *   5. Insert into database
 *
 * Usage:
 *   tsx scripts/ingest-lagennu-full-archive.ts [options]
 *
 * Options:
 *   --limit N          Process only first N cases total
 *   --court <code>     Process only specific court (hfd, nja, ad, mod, mig, rh, pmod)
 *   --year <YYYY>      Process only specific year
 *   --start-year YYYY  Start from this year (default: per-court config)
 *   --end-year YYYY    End at this year (default: current year)
 *   --dry-run          Show what would be scraped without making changes
 *
 * Examples:
 *   tsx scripts/ingest-lagennu-full-archive.ts --limit 100
 *   tsx scripts/ingest-lagennu-full-archive.ts --court hfd --year 2023
 *   tsx scripts/ingest-lagennu-full-archive.ts --start-year 2020
 *   tsx scripts/ingest-lagennu-full-archive.ts --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import Database from 'better-sqlite3';
import { JSDOM } from 'jsdom';
import {
  type CaseId,
  type CaseMetadata,
  parseCaseId,
  parseRdfMetadata,
  insertOrUpdateCase,
  fetchWithRetry,
  delay,
  REQUEST_DELAY_MS,
  caseIdToRdfUrl,
} from './lib/lagennu-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DB_PATH = path.resolve(__dirname, '../data/database.db');
const LOG_DIR = path.resolve(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, 'ingest-lagennu-full-archive.log');

const DATASET_BASE_URL = 'https://lagen.nu/dataset/dv';

// Court configuration
interface CourtConfig {
  code: string;           // Query parameter (hfd, nja, ad, etc.)
  shortCode: string;      // Case ID prefix (HFD, NJA, AD, etc.)
  name: string;           // Full court name
  startYear: number;      // First year with data
}

const COURTS: CourtConfig[] = [
  {
    code: 'hfd',
    shortCode: 'HFD',
    name: 'Högsta förvaltningsdomstolen',
    startYear: 2011,
  },
  {
    code: 'nja',
    shortCode: 'NJA',
    name: 'Högsta domstolen',
    startYear: 1981,
  },
  {
    code: 'ad',
    shortCode: 'AD',
    name: 'Arbetsdomstolen',
    startYear: 1993,
  },
  {
    code: 'mod',
    shortCode: 'MÖD',
    name: 'Mark- och miljööverdomstolen',
    startYear: 2011,
  },
  {
    code: 'mig',
    shortCode: 'MIG',
    name: 'Migrationsöverdomstolen',
    startYear: 2006,
  },
  {
    code: 'rh',
    shortCode: 'RH',
    name: 'Rättsfall från hovrätterna',
    startYear: 1993,
  },
  {
    code: 'pmod',
    shortCode: 'PMÖD',
    name: 'Patent- och marknadsöverdomstolen',
    startYear: 2016,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ScrapeOptions {
  limit?: number;
  court?: string;
  year?: number;
  startYear: number;
  endYear: number;
  dryRun: boolean;
}

interface ScrapeStats {
  courts_processed: number;
  years_processed: number;
  cases_found: number;
  cases_fetched: number;
  cases_inserted: number;
  cases_updated: number;
  cases_failed: number;
  cases_skipped: number;
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
// Dataset Page Scraping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch dataset page for a specific court and year
 * Example: https://lagen.nu/dataset/dv?hfd=2023
 */
async function fetchDatasetPage(courtCode: string, year: number): Promise<string> {
  const url = `${DATASET_BASE_URL}?${courtCode}=${year}`;
  return await fetchWithRetry(url);
}

/**
 * Extract case IDs from dataset page HTML
 * Looks for links like: <a href="/dom/hfd/2023:1">HFD 2023:1</a>
 */
function extractCaseIdsFromDatasetPage(html: string, courtShortCode: string): CaseId[] {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const caseIds: CaseId[] = [];
  const links = document.querySelectorAll('a[href*="/dom/"]');

  for (const link of Array.from(links)) {
    const text = link.textContent?.trim();
    if (!text) continue;

    // Only parse cases matching the expected court
    if (!text.toUpperCase().startsWith(courtShortCode.toUpperCase())) {
      continue;
    }

    const parsed = parseCaseId(text);
    if (parsed && parsed.court === courtShortCode.toUpperCase()) {
      caseIds.push(parsed);
    }
  }

  return caseIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Operations (404-aware)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a single case: fetch RDF, parse, insert/update
 * Returns true if successful, false if failed (including 404)
 */
async function processCaseWithRetry(
  caseId: CaseId,
  db: Database.Database,
  insertDoc: Database.Statement,
  insertCase: Database.Statement,
  stats: ScrapeStats
): Promise<{ success: boolean; skipped: boolean }> {
  try {
    const rdfUrl = caseIdToRdfUrl(caseId);
    const rdf = await fetchWithRetry(rdfUrl);

    stats.cases_fetched++;

    // Parse RDF
    const metadata = parseRdfMetadata(rdf, caseId);

    if (!metadata) {
      stats.cases_skipped++;
      return { success: false, skipped: true };
    }

    // Insert/update in a transaction
    const transaction = db.transaction(() => {
      const result = insertOrUpdateCase(db, metadata, insertDoc, insertCase);
      if (result.inserted) stats.cases_inserted++;
      if (result.updated) stats.cases_updated++;
    });

    try {
      transaction();
      return { success: true, skipped: false };
    } catch (dbError) {
      stats.cases_failed++;
      logError(`Database error for ${caseId.original}`, dbError as Error);
      return { success: false, skipped: false };
    }
  } catch (error) {
    const err = error as Error;

    // 404 means the case doesn't exist on lagen.nu (yet)
    if (err.message.includes('404') || err.message.includes('NOT FOUND')) {
      stats.cases_skipped++;
      return { success: false, skipped: true };
    }

    stats.cases_failed++;
    logError(`Failed to fetch ${caseId.original}`, err);
    return { success: false, skipped: false };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Scraping Logic
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeFullArchive(options: ScrapeOptions): Promise<void> {
  log('Lagen.nu Full Archive Scraper');
  log(`  Database: ${DB_PATH}`);
  log(`  Year range: ${options.startYear}-${options.endYear}`);
  log(`  Limit: ${options.limit || 'none'}`);
  log(`  Dry run: ${options.dryRun}`);
  if (options.court) {
    log(`  Court filter: ${options.court}`);
  }
  if (options.year) {
    log(`  Year filter: ${options.year}`);
  }
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

  const stats: ScrapeStats = {
    courts_processed: 0,
    years_processed: 0,
    cases_found: 0,
    cases_fetched: 0,
    cases_inserted: 0,
    cases_updated: 0,
    cases_failed: 0,
    cases_skipped: 0,
  };

  try {
    // Filter courts
    const courtsToProcess = options.court
      ? COURTS.filter(c => c.code === options.court)
      : COURTS;

    if (courtsToProcess.length === 0) {
      logError(`Unknown court code: ${options.court}`);
      process.exit(1);
    }

    let totalCasesProcessed = 0;

    // Process each court
    for (const court of courtsToProcess) {
      log(`\n${'═'.repeat(70)}`);
      log(`Processing: ${court.name} (${court.shortCode})`);
      log(`${'═'.repeat(70)}\n`);

      stats.courts_processed++;

      // Determine year range
      const startYear = options.year || Math.max(options.startYear, court.startYear);
      const endYear = options.year || options.endYear;

      // Process each year
      for (let year = endYear; year >= startYear; year--) {
        // Check limit
        if (options.limit && totalCasesProcessed >= options.limit) {
          log(`\nReached limit of ${options.limit} cases. Stopping.`);
          break;
        }

        try {
          log(`  Year ${year}:`);

          // Fetch dataset page
          const html = await fetchDatasetPage(court.code, year);
          stats.years_processed++;

          // Extract case IDs
          const caseIds = extractCaseIdsFromDatasetPage(html, court.shortCode);
          stats.cases_found += caseIds.length;

          log(`    Found ${caseIds.length} cases`);

          if (caseIds.length === 0) {
            continue;
          }

          if (options.dryRun) {
            // Dry run: just show what would be processed
            for (const caseId of caseIds.slice(0, 5)) {
              log(`      - ${caseId.original}`);
            }
            if (caseIds.length > 5) {
              log(`      ... and ${caseIds.length - 5} more`);
            }
            continue;
          }

          // Process each case
          for (let i = 0; i < caseIds.length; i++) {
            // Check limit
            if (options.limit && totalCasesProcessed >= options.limit) {
              break;
            }

            const caseId = caseIds[i];

            const result = await processCaseWithRetry(
              caseId,
              db,
              insertDoc,
              insertCase,
              stats
            );

            totalCasesProcessed++;

            // Progress reporting every 25 cases
            if ((i + 1) % 25 === 0 || i === caseIds.length - 1) {
              log(`    [${i + 1}/${caseIds.length}] Processed ${caseId.original} ` +
                  `(inserted: ${stats.cases_inserted}, updated: ${stats.cases_updated}, ` +
                  `failed: ${stats.cases_failed}, skipped: ${stats.cases_skipped})`);
            }

            // Rate limiting
            if (i < caseIds.length - 1) {
              await delay(REQUEST_DELAY_MS);
            }
          }

          // Rate limiting between years
          await delay(REQUEST_DELAY_MS);

        } catch (error) {
          logError(`Failed to process ${court.code} year ${year}`, error as Error);
          continue;
        }
      }

      // Check if we hit the limit
      if (options.limit && totalCasesProcessed >= options.limit) {
        break;
      }
    }

    if (!options.dryRun) {
      // Optimize database
      log('\nOptimizing database...');
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.exec('ANALYZE');
    }

  } finally {
    db.close();
  }

  // Final summary
  log('');
  log('═══════════════════════════════════════════════════════════════════');
  log('Full Archive Scraping Complete');
  log('═══════════════════════════════════════════════════════════════════');
  log(`  Courts processed:   ${stats.courts_processed}`);
  log(`  Years processed:    ${stats.years_processed}`);
  log(`  Cases found:        ${stats.cases_found}`);
  log(`  Cases fetched:      ${stats.cases_fetched}`);
  log(`  Cases inserted:     ${stats.cases_inserted}`);
  log(`  Cases updated:      ${stats.cases_updated}`);
  log(`  Cases failed:       ${stats.cases_failed}`);
  log(`  Cases skipped:      ${stats.cases_skipped}`);
  log('═══════════════════════════════════════════════════════════════════');
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

  const options: ScrapeOptions = {
    startYear: 1950,
    endYear: new Date().getFullYear(),
    dryRun: false,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        if (isNaN(options.limit) || options.limit <= 0) {
          console.error('Error: --limit must be a positive number');
          process.exit(1);
        }
        break;
      case '--court':
        options.court = args[++i];
        break;
      case '--year':
        options.year = parseInt(args[++i], 10);
        if (isNaN(options.year)) {
          console.error('Error: --year must be a valid year');
          process.exit(1);
        }
        break;
      case '--start-year':
        options.startYear = parseInt(args[++i], 10);
        if (isNaN(options.startYear)) {
          console.error('Error: --start-year must be a valid year');
          process.exit(1);
        }
        break;
      case '--end-year':
        options.endYear = parseInt(args[++i], 10);
        if (isNaN(options.endYear)) {
          console.error('Error: --end-year must be a valid year');
          process.exit(1);
        }
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  scrapeFullArchive(options).catch(error => {
    logError('Full archive scraping failed', error);
    process.exit(1);
  });
}
