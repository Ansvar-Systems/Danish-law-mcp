#!/usr/bin/env tsx
/**
 * Incremental Sync Script for Lagen.nu Case Law
 *
 * Efficiently updates the case law database with new cases only.
 *
 * Features:
 * - Checks last sync timestamp from database
 * - Fetches only new cases from lagen.nu feed
 * - Updates sync metadata table
 * - Supports full refresh mode
 * - JSON output for automation
 * - Dry run mode
 *
 * Usage:
 *   tsx scripts/sync-lagennu-cases.ts              # Normal sync
 *   tsx scripts/sync-lagennu-cases.ts --full       # Full refresh
 *   tsx scripts/sync-lagennu-cases.ts --json       # JSON output
 *   tsx scripts/sync-lagennu-cases.ts --dry-run    # Show what would be synced
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import Database from 'better-sqlite3';
import {
  type CaseId,
  type CaseMetadata,
  fetchCaseIdsFromFeed,
  fetchCaseRdf,
  parseRdfMetadata,
  insertOrUpdateCase,
  delay,
  REQUEST_DELAY_MS,
  extractDecisionDateFromCaseId,
} from './lib/lagennu-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const DB_PATH = path.resolve(__dirname, '../data/database.db');
const LOG_DIR = path.resolve(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, 'sync-lagennu.log');
const BATCH_SIZE = 100;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SyncOptions {
  full: boolean;
  dryRun: boolean;
  jsonOutput: boolean;
}

interface SyncStats {
  new_cases_added: number;
  cases_updated: number;
  cases_skipped: number;
  cases_failed: number;
  total_cases_in_db: number;
}

interface SyncMetadata {
  last_sync_date: string;
  last_decision_date: string | null;
  cases_count: number;
  source: string;
}

interface SyncReport {
  status: 'success' | 'error';
  timestamp: string;
  mode: 'incremental' | 'full';
  dry_run: boolean;
  stats: SyncStats;
  metadata: SyncMetadata;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

let logToConsole = true;

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function log(message: string): void {
  if (logToConsole) {
    console.log(message);
  }

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  ensureLogDir();
  fs.appendFileSync(LOG_FILE, logMessage);
}

function logError(message: string, error?: Error): void {
  const timestamp = new Date().toISOString();
  const errorDetails = error ? `\n  Error: ${error.message}\n  Stack: ${error.stack}` : '';
  const logMessage = `[${timestamp}] ERROR: ${message}${errorDetails}\n`;

  if (logToConsole) {
    console.error(logMessage);
  }

  ensureLogDir();
  fs.appendFileSync(LOG_FILE, logMessage);
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Sync Metadata
// ─────────────────────────────────────────────────────────────────────────────

const SYNC_METADATA_SCHEMA = `
CREATE TABLE IF NOT EXISTS case_law_sync_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_sync_date TEXT NOT NULL,
  last_decision_date TEXT,
  cases_count INTEGER,
  source TEXT DEFAULT 'lagen.nu'
);
`;

function ensureSyncMetadataTable(db: Database.Database): void {
  db.exec(SYNC_METADATA_SCHEMA);
}

function getLastSyncMetadata(db: Database.Database): SyncMetadata | null {
  const row = db.prepare(`
    SELECT last_sync_date, last_decision_date, cases_count, source
    FROM case_law_sync_metadata
    WHERE id = 1
  `).get() as SyncMetadata | undefined;

  return row || null;
}

function updateSyncMetadata(db: Database.Database, stats: SyncStats): void {
  const now = new Date().toISOString();

  // Get most recent decision date from database
  const latestDecision = db.prepare(`
    SELECT decision_date
    FROM case_law
    WHERE decision_date IS NOT NULL
    ORDER BY decision_date DESC
    LIMIT 1
  `).get() as { decision_date: string | null } | undefined;

  const lastDecisionDate = latestDecision?.decision_date || null;

  db.prepare(`
    INSERT OR REPLACE INTO case_law_sync_metadata
      (id, last_sync_date, last_decision_date, cases_count, source)
    VALUES (1, ?, ?, ?, 'lagen.nu')
  `).run(now, lastDecisionDate, stats.total_cases_in_db);
}

// ─────────────────────────────────────────────────────────────────────────────
// Case Filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter cases to only include those newer than the last sync
 */
function filterNewCases(
  allCases: CaseId[],
  lastSyncDate: string | null,
  db: Database.Database
): CaseId[] {
  if (!lastSyncDate) {
    return allCases;
  }

  const existingCaseIds = new Set<string>();
  const rows = db.prepare('SELECT id FROM legal_documents WHERE type = ?').all('case_law') as { id: string }[];

  for (const row of rows) {
    existingCaseIds.add(row.id);
  }

  // Filter out cases that already exist in the database
  const newCases = allCases.filter(caseId => {
    const documentId = `${caseId.court}-${caseId.year}:${caseId.number}`;
    return !existingCaseIds.has(documentId);
  });

  return newCases;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Sync Logic
// ─────────────────────────────────────────────────────────────────────────────

async function syncCaseLaw(options: SyncOptions): Promise<SyncReport> {
  const startTime = new Date();
  const stats: SyncStats = {
    new_cases_added: 0,
    cases_updated: 0,
    cases_skipped: 0,
    cases_failed: 0,
    total_cases_in_db: 0,
  };

  try {
    log('Lagen.nu Case Law Sync');
    log(`  Database: ${DB_PATH}`);
    log(`  Mode: ${options.full ? 'FULL' : 'INCREMENTAL'}`);
    log(`  Dry run: ${options.dryRun}`);
    log('');

    // Verify database exists
    if (!fs.existsSync(DB_PATH)) {
      const errorMsg = 'Database not found. Run npm run build:db first.';
      logError(errorMsg);
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        mode: options.full ? 'full' : 'incremental',
        dry_run: options.dryRun,
        stats,
        metadata: {
          last_sync_date: new Date().toISOString(),
          last_decision_date: null,
          cases_count: 0,
          source: 'lagen.nu',
        },
        error: errorMsg,
      };
    }

    // Open database
    const db = new Database(DB_PATH);
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    try {
      // Ensure sync metadata table exists
      ensureSyncMetadataTable(db);

      // Get last sync metadata
      const lastSync = getLastSyncMetadata(db);
      const lastSyncDate = options.full ? null : lastSync?.last_sync_date || null;

      if (lastSyncDate) {
        log(`Last sync: ${lastSyncDate}`);
        if (lastSync?.last_decision_date) {
          log(`Last decision date: ${lastSync.last_decision_date}`);
        }
      } else {
        log('No previous sync found or full refresh requested');
      }
      log('');

      // Fetch all case IDs from feed
      log('Fetching case list from lagen.nu feed...');
      const allCases = await fetchCaseIdsFromFeed();
      log(`  Found ${allCases.length} cases in feed`);

      // Filter to new cases only
      const casesToSync = filterNewCases(allCases, lastSyncDate, db);
      log(`  ${casesToSync.length} new cases to sync`);
      log('');

      if (casesToSync.length === 0) {
        log('No new cases to sync. Database is up to date.');

        // Get current case count
        const countRow = db.prepare('SELECT COUNT(*) as count FROM case_law').get() as { count: number };
        stats.total_cases_in_db = countRow.count;

        // Update sync metadata
        if (!options.dryRun) {
          updateSyncMetadata(db, stats);
        }

        return {
          status: 'success',
          timestamp: new Date().toISOString(),
          mode: options.full ? 'full' : 'incremental',
          dry_run: options.dryRun,
          stats,
          metadata: lastSync || {
            last_sync_date: new Date().toISOString(),
            last_decision_date: null,
            cases_count: stats.total_cases_in_db,
            source: 'lagen.nu',
          },
        };
      }

      if (options.dryRun) {
        log('DRY RUN MODE - No changes will be made');
        log('');
        log('Cases that would be synced:');
        for (const caseId of casesToSync.slice(0, 10)) {
          log(`  - ${caseId.original}`);
        }
        if (casesToSync.length > 10) {
          log(`  ... and ${casesToSync.length - 10} more`);
        }

        return {
          status: 'success',
          timestamp: new Date().toISOString(),
          mode: options.full ? 'full' : 'incremental',
          dry_run: true,
          stats,
          metadata: lastSync || {
            last_sync_date: new Date().toISOString(),
            last_decision_date: null,
            cases_count: 0,
            source: 'lagen.nu',
          },
        };
      }

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

      // Process cases in batches
      log(`Processing ${casesToSync.length} cases...`);
      log('');

      let currentBatch: Array<() => void> = [];

      for (let i = 0; i < casesToSync.length; i++) {
        const caseId = casesToSync[i];

        try {
          // Fetch RDF metadata
          const rdf = await fetchCaseRdf(caseId);

          // Parse RDF
          const metadata = parseRdfMetadata(rdf, caseId);

          if (!metadata) {
            stats.cases_skipped++;
            log(`  [${i + 1}/${casesToSync.length}] SKIPPED: ${caseId.original} (parse failed)`);
            continue;
          }

          // Queue database operation for batch
          currentBatch.push(() => {
            const result = insertOrUpdateCase(db, metadata, insertDoc, insertCase);
            if (result.inserted) stats.new_cases_added++;
            if (result.updated) stats.cases_updated++;
          });

          // Execute batch when full
          if (currentBatch.length >= BATCH_SIZE || i === casesToSync.length - 1) {
            const transaction = db.transaction(() => {
              for (const op of currentBatch) {
                op();
              }
            });
            transaction();
            currentBatch = [];
          }

          // Progress reporting every 25 cases
          if ((i + 1) % 25 === 0 || i === casesToSync.length - 1) {
            log(`  [${i + 1}/${casesToSync.length}] Processed ${caseId.original} ` +
                `(new: ${stats.new_cases_added}, updated: ${stats.cases_updated}, failed: ${stats.cases_failed})`);
          }

          // Rate limiting
          if (i < casesToSync.length - 1) {
            await delay(REQUEST_DELAY_MS);
          }
        } catch (error) {
          stats.cases_failed++;
          logError(`Failed to process ${caseId.original}`, error as Error);
          continue;
        }
      }

      // Get total case count
      const countRow = db.prepare('SELECT COUNT(*) as count FROM case_law').get() as { count: number };
      stats.total_cases_in_db = countRow.count;

      // Update sync metadata
      updateSyncMetadata(db, stats);

      // Optimize database
      log('');
      log('Optimizing database...');
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.exec('ANALYZE');

      const finalMetadata = getLastSyncMetadata(db);

      return {
        status: 'success',
        timestamp: new Date().toISOString(),
        mode: options.full ? 'full' : 'incremental',
        dry_run: false,
        stats,
        metadata: finalMetadata || {
          last_sync_date: new Date().toISOString(),
          last_decision_date: null,
          cases_count: stats.total_cases_in_db,
          source: 'lagen.nu',
        },
      };

    } finally {
      db.close();
    }

  } catch (error) {
    logError('Sync failed', error as Error);
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      mode: options.full ? 'full' : 'incremental',
      dry_run: options.dryRun,
      stats,
      metadata: {
        last_sync_date: new Date().toISOString(),
        last_decision_date: null,
        cases_count: 0,
        source: 'lagen.nu',
      },
      error: (error as Error).message,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const isMainModule = process.argv[1] != null &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  const args = process.argv.slice(2);

  const options: SyncOptions = {
    full: args.includes('--full'),
    dryRun: args.includes('--dry-run'),
    jsonOutput: args.includes('--json'),
  };

  // Disable console logging for JSON output
  if (options.jsonOutput) {
    logToConsole = false;
  }

  syncCaseLaw(options)
    .then(report => {
      if (options.jsonOutput) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        // Final summary
        log('');
        log('═══════════════════════════════════════════════════════════════');
        log('Sync Complete');
        log('═══════════════════════════════════════════════════════════════');
        log(`  New cases added:    ${report.stats.new_cases_added}`);
        log(`  Cases updated:      ${report.stats.cases_updated}`);
        log(`  Cases skipped:      ${report.stats.cases_skipped}`);
        log(`  Cases failed:       ${report.stats.cases_failed}`);
        log(`  Total cases in DB:  ${report.stats.total_cases_in_db}`);
        log('═══════════════════════════════════════════════════════════════');
        log(`  Last sync: ${report.metadata.last_sync_date}`);
        if (report.metadata.last_decision_date) {
          log(`  Latest decision: ${report.metadata.last_decision_date}`);
        }
        log(`  Log file: ${LOG_FILE}`);
        log('');
      }

      process.exit(report.status === 'success' ? 0 : 1);
    })
    .catch(error => {
      logError('Sync failed with unexpected error', error);
      process.exit(1);
    });
}
