#!/usr/bin/env tsx
/**
 * Ingest Danish court decisions from Domsdatabasen (alexandrainst/domsdatabasen).
 *
 * Source:   HuggingFace Datasets Server REST API (JSON, no auth)
 * Dataset:  alexandrainst/domsdatabasen — ~3,920 decisions, CC0 1.0
 * Courts:   32 Danish courts (Højesteret, Østre/Vestre Landsret, byret, etc.)
 *
 * Populates: legal_documents (type='case_law'), case_law, case_law_full
 *
 * Usage:
 *   npm run ingest:domsdatabasen                  # full ingestion
 *   npm run ingest:domsdatabasen -- --limit 50    # test with 50 rows
 *   npm run ingest:domsdatabasen -- --resume      # skip existing
 *   npm run ingest:domsdatabasen -- --dry-run     # preview only
 */

import Database from '@ansvar/mcp-sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../data/database.db');

// ─────────────────────────────────────────────────────────────────────────────
// HuggingFace Datasets Server API
// ─────────────────────────────────────────────────────────────────────────────

const DATASET = 'alexandrainst/domsdatabasen';
const HF_ROWS_URL = 'https://datasets-server.huggingface.co/rows';
const PAGE_SIZE = 100; // max allowed by HF API

interface DomsdatabasenRow {
  case_id: string;                     // e.g. "1"
  Overskrift: string;                  // heading / summary
  'Afgørelsesstatus': string;          // e.g. "Appelleret", "Ikke appelleret"
  Faggruppe: string;                   // e.g. "Civilsag", "Straffesag"
  Ret: string;                         // court, e.g. "Vestre Landsret"
  'Rettens sagsnummer': string;        // case number, e.g. "BS-19416/2020-VLR"
  Sagstype: string;                    // e.g. "Almindelig civil sag"
  Instans: string;                     // e.g. "1. instans", "2. instans"
  'Domsdatabasens sagsnummer': string; // e.g. "2/21"
  Sagsemner: string;                   // semicolon-separated keywords
  text: string;                        // full decision text
  text_anonymized: string;             // anonymized version
  text_len: number;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Court normalization
// ─────────────────────────────────────────────────────────────────────────────

const COURT_MAP: Record<string, string> = {
  'højesteret': 'Højesteret',
  'østre landsret': 'Østre Landsret',
  'vestre landsret': 'Vestre Landsret',
  'sø- og handelsretten': 'Sø- og Handelsretten',
};

function normalizeCourt(raw: string): string {
  const lower = raw.trim().toLowerCase();
  return COURT_MAP[lower] ?? raw.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Date extraction from decision text
// ─────────────────────────────────────────────────────────────────────────────

const DANISH_MONTHS: Record<string, string> = {
  januar: '01', februar: '02', marts: '03', april: '04',
  maj: '05', juni: '06', juli: '07', august: '08',
  september: '09', oktober: '10', november: '11', december: '12',
};

/**
 * Extract decision date from the text body.
 * Danish decisions typically start with "afsagt den 15. juni 2021" or similar.
 */
function extractDate(text: string): string {
  // Match "afsagt den DD. MMMM YYYY" or "den DD. MMMM YYYY"
  const match = text.match(/(?:afsagt|afsagt den|den)\s+(\d{1,2})\.\s+(\w+)\s+(\d{4})/i);
  if (match) {
    const [, day, monthStr, year] = match;
    const month = DANISH_MONTHS[monthStr.toLowerCase()];
    if (month) {
      return `${year}-${month}-${day.padStart(2, '0')}`;
    }
  }
  // Fallback: try to extract year from case number (e.g. BS-19416/2020-VLR → 2020)
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch with retry
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      const wait = attempt * 5000;
      console.log(`  HTTP ${res.status} — retry ${attempt}/${maxRetries} in ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${res.statusText} — ${url}`);
  }
  throw new Error(`Failed after ${maxRetries} retries — ${url}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESUME = args.includes('--resume');
const limitIdx = args.indexOf('--limit');
const MAX_ROWS = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══ Domsdatabasen Ingestion ═══');
  console.log(`  Dataset:  ${DATASET}`);
  console.log(`  Mode:     ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Resume:   ${RESUME}`);
  console.log(`  Limit:    ${MAX_ROWS === Infinity ? 'none' : MAX_ROWS}`);
  console.log();

  // First, discover dataset info (total rows)
  const infoUrl = `https://datasets-server.huggingface.co/info?dataset=${encodeURIComponent(DATASET)}`;
  const infoRes = await fetchWithRetry(infoUrl);
  const info = await infoRes.json() as {
    dataset_info?: Record<string, { splits?: Record<string, { num_examples?: number }> }>;
  };
  const totalRows = info?.dataset_info?.default?.splits?.train?.num_examples ?? 0;
  console.log(`  Total rows in dataset: ${totalRows.toLocaleString()}`);

  if (DRY_RUN) {
    console.log('\n  DRY RUN — would fetch and insert up to', Math.min(totalRows, MAX_ROWS), 'rows');
    return;
  }

  // Open database
  if (!fs.existsSync(DB_PATH)) {
    console.error(`ERROR: No database at ${DB_PATH}. Run 'npm run build:db' first.`);
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  // Check if case_law_full table exists (paid tier)
  const hasCaseLawFull = !!db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='case_law_full'"
  ).get();

  if (hasCaseLawFull) {
    console.log('  Paid tier detected: will populate case_law_full');
  }

  // Existing IDs for --resume
  const existingIds = new Set<string>();
  if (RESUME) {
    const rows = db.prepare("SELECT id FROM legal_documents WHERE id LIKE 'domsdatabasen:%'").all() as { id: string }[];
    for (const r of rows) existingIds.add(r.id);
    console.log(`  Resume: ${existingIds.size} existing entries will be skipped`);
  }

  // Prepared statements
  const insertDoc = db.prepare(`
    INSERT OR IGNORE INTO legal_documents (id, title, type, status, url)
    VALUES (?, ?, 'case_law', 'in_force', ?)
  `);

  const insertCaseLaw = db.prepare(`
    INSERT OR IGNORE INTO case_law (document_id, court, case_number, decision_date, summary, keywords)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertCaseLawFull = hasCaseLawFull
    ? db.prepare(`
        INSERT OR IGNORE INTO case_law_full (case_law_id, full_text, headnotes, dissenting_opinions)
        VALUES (?, ?, NULL, NULL)
      `)
    : null;

  // Stats
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  let offset = 0;

  // Paginate through HuggingFace Datasets Server
  while (offset < Math.min(totalRows, MAX_ROWS)) {
    const length = Math.min(PAGE_SIZE, MAX_ROWS - offset);
    const url = `${HF_ROWS_URL}?dataset=${encodeURIComponent(DATASET)}&config=default&split=train&offset=${offset}&length=${length}`;

    let rows: DomsdatabasenRow[];
    try {
      const res = await fetchWithRetry(url);
      const data = await res.json() as { rows?: { row: DomsdatabasenRow }[] };
      rows = (data.rows ?? []).map(r => r.row);
    } catch (err) {
      console.error(`  Error fetching offset ${offset}:`, err);
      failed += length;
      offset += length;
      continue;
    }

    if (rows.length === 0) break;

    // Insert batch in a transaction
    const insertBatch = db.transaction(() => {
      for (const row of rows) {
        const docId = `domsdatabasen:${row.case_id}`;

        if (RESUME && existingIds.has(docId)) {
          skipped++;
          continue;
        }

        const court = normalizeCourt(row.Ret ?? 'Unknown');
        const caseNumber = row['Rettens sagsnummer'] ?? '';
        const fullText = row.text ?? '';
        const date = extractDate(fullText);
        const summary = row.Overskrift ?? '';
        const keywords = row.Sagsemner ?? '';
        const title = `${court} — ${caseNumber || row.case_id}${date ? ` (${date})` : ''}`;

        try {
          insertDoc.run(docId, title, `https://huggingface.co/datasets/${DATASET}`);
          const result = insertCaseLaw.run(docId, court, caseNumber, date, summary, keywords);

          if (insertCaseLawFull && result.changes > 0 && fullText) {
            const caseLawId = db.prepare('SELECT id FROM case_law WHERE document_id = ?').get(docId) as { id: number } | undefined;
            if (caseLawId) {
              insertCaseLawFull.run(caseLawId.id, fullText);
            }
          }

          inserted++;
        } catch (err) {
          // Likely duplicate
          skipped++;
        }
      }
    });

    insertBatch();

    offset += rows.length;
    if (offset % 500 === 0 || offset >= Math.min(totalRows, MAX_ROWS)) {
      console.log(`  [${offset}] inserted=${inserted} skipped=${skipped} failed=${failed}`);
    }
  }

  // Finalize
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();

  console.log(`\n═══ Domsdatabasen Ingestion Complete ═══`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Database: ${DB_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
