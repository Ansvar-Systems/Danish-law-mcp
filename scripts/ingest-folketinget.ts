#!/usr/bin/env tsx
/**
 * Ingest Danish preparatory works (lovforslag) from Folketinget OData API.
 *
 * Source:   oda.ft.dk — Danish Parliament Open Data API (OData v3)
 * Content:  ~5,200+ lovforslag (legislative proposals), public domain
 *
 * Populates: legal_documents (type='bill'), preparatory_works, preparatory_works_full
 *
 * Links lovforslag → statutes via lovnummer/lovnummerdato when enacted.
 *
 * Usage:
 *   npm run ingest:folketinget                      # full ingestion
 *   npm run ingest:folketinget -- --limit 50        # test with 50 rows
 *   npm run ingest:folketinget -- --resume          # skip existing
 *   npm run ingest:folketinget -- --dry-run         # preview only
 *   npm run ingest:folketinget -- --enacted-only    # only enacted bills (statusid=11)
 */

import Database from '@ansvar/mcp-sqlite';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../data/database.db');
const CACHE_DIR = path.resolve(__dirname, '../data/source/folketinget');

// ─────────────────────────────────────────────────────────────────────────────
// OData API
// ─────────────────────────────────────────────────────────────────────────────

const ODA_BASE = 'https://oda.ft.dk/api';
const PAGE_SIZE = 100; // OData max

// Status IDs for lovforslag lifecycle
const STATUS_MAP: Record<number, string> = {
  25: 'Fremsat',                        // Introduced
  28: '1. behandling',                  // 1st reading
  32: '2. behandling / direkte til 3.', // 2nd reading
  33: '2. behandling / udvalg',         // 2nd reading, committee
  41: 'Vedtaget',                       // Passed (3rd reading)
  11: 'Stadfæstet',                     // Royal assent (enacted)
  3:  'Forkastet',                      // Rejected
  37: 'Forkastet (3. behandling)',      // Rejected at 3rd reading
  4:  'Tilbagetaget',                   // Withdrawn
  13: 'Bortfaldet',                     // Lapsed
  40: 'Delt',                           // Split into sub-bills
};

interface FolketingetSag {
  id: number;
  typeid: number;
  statusid: number;
  titel: string;
  titelkort: string;
  nummer: string;           // e.g. "L 120"
  resume: string | null;    // summary/abstract
  lovnummer: string | null; // law number when enacted
  lovnummerdato: string | null;
  afgørelsesdato: string | null;
  opdateringsdato: string;
  periodeid: number;
  kategoriid: number | null;
  fremsatundersagid: number | null;
  deltundersagid: number | null;
}

interface EmneordSag {
  Emneord?: { emneord: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch with retry
// ─────────────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, maxRetries = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json() as T;
    if (res.status === 429 || res.status >= 500) {
      const wait = attempt * 3000;
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
const ENACTED_ONLY = args.includes('--enacted-only');
const limitIdx = args.indexOf('--limit');
const MAX_ROWS = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Try to find a matching statute in the DB by law number and year.
 * Danish statutes are keyed as "{year}_{number}" in the legal_documents table.
 */
function findStatuteId(db: InstanceType<typeof Database>, lovnummer: string, lovnummerdato: string): string | null {
  const year = lovnummerdato.substring(0, 4);

  // Danish statute IDs use "{year}:{number}" format (e.g., "2024:306")
  const colonId = `${year}:${lovnummer}`;
  const colonMatch = db.prepare("SELECT id FROM legal_documents WHERE id = ? AND type != 'bill'").get(colonId) as { id: string } | undefined;
  if (colonMatch) return colonMatch.id;

  // Fallback: search by title
  const titleMatch = db.prepare(
    "SELECT id FROM legal_documents WHERE title LIKE ? AND type != 'bill' LIMIT 1"
  ).get(`%nr. ${lovnummer}%`) as { id: string } | undefined;
  if (titleMatch) return titleMatch.id;

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══ Folketinget Lovforslag Ingestion ═══');
  console.log(`  Source:   ${ODA_BASE}`);
  console.log(`  Mode:     ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Resume:   ${RESUME}`);
  console.log(`  Enacted:  ${ENACTED_ONLY ? 'only' : 'all'}`);
  console.log(`  Limit:    ${MAX_ROWS === Infinity ? 'none' : MAX_ROWS}`);
  console.log();

  // Get total count
  const filter = ENACTED_ONLY
    ? "typeid eq 3 and statusid eq 11"
    : "typeid eq 3";
  const countUrl = `${ODA_BASE}/Sag?$filter=${encodeURIComponent(filter)}&$top=0&$inlinecount=allpages`;
  const countData = await fetchJson<{ 'odata.count': string }>(countUrl);
  const totalCount = parseInt(countData['odata.count'], 10);
  console.log(`  Total lovforslag: ${totalCount.toLocaleString()}`);

  if (DRY_RUN) {
    console.log('\n  DRY RUN — would fetch and insert up to', Math.min(totalCount, MAX_ROWS), 'lovforslag');
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

  // Check if preparatory_works_full table exists (paid tier)
  const hasPrepFull = !!db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='preparatory_works_full'"
  ).get();

  if (hasPrepFull) {
    console.log('  Paid tier detected: will populate preparatory_works_full');
  }

  // Ensure cache dir exists
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Existing IDs for --resume
  const existingIds = new Set<string>();
  if (RESUME) {
    const rows = db.prepare("SELECT id FROM legal_documents WHERE id LIKE 'ft-lovforslag:%'").all() as { id: string }[];
    for (const r of rows) existingIds.add(r.id);
    console.log(`  Resume: ${existingIds.size} existing entries will be skipped`);
  }

  // Prepared statements
  const insertDoc = db.prepare(`
    INSERT OR IGNORE INTO legal_documents (id, title, type, status, issued_date, url)
    VALUES (?, ?, 'bill', ?, ?, ?)
  `);

  const insertPrepWork = db.prepare(`
    INSERT OR IGNORE INTO preparatory_works (statute_id, prep_document_id, title, summary)
    VALUES (?, ?, ?, ?)
  `);

  const insertPrepFull = hasPrepFull
    ? db.prepare(`
        INSERT OR IGNORE INTO preparatory_works_full (prep_work_id, full_text, section_summaries)
        VALUES (?, ?, NULL)
      `)
    : null;

  // Stats
  let inserted = 0;
  let linked = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  // Paginate through OData API
  let skip = 0;
  while (processed < Math.min(totalCount, MAX_ROWS)) {
    const top = Math.min(PAGE_SIZE, MAX_ROWS - processed);
    const url = `${ODA_BASE}/Sag?$filter=${encodeURIComponent(filter)}&$orderby=id asc&$top=${top}&$skip=${skip}`;

    let sager: FolketingetSag[];
    try {
      const data = await fetchJson<{ value: FolketingetSag[] }>(url);
      sager = data.value ?? [];
    } catch (err) {
      console.error(`  Error fetching skip=${skip}:`, err);
      failed += top;
      skip += top;
      processed += top;
      continue;
    }

    if (sager.length === 0) break;

    // Process each lovforslag
    for (const sag of sager) {
      if (processed >= MAX_ROWS) break;
      processed++;

      const docId = `ft-lovforslag:${sag.id}`;
      if (RESUME && existingIds.has(docId)) {
        skipped++;
        continue;
      }

      const statusText = STATUS_MAP[sag.statusid] ?? `status-${sag.statusid}`;
      const isEnacted = sag.statusid === 11;
      const status = isEnacted ? 'in_force' : 'amended';
      const title = sag.titel || sag.titelkort || `Lovforslag ${sag.nummer}`;
      const summary = sag.resume ?? '';

      // Determine the date — prefer afgørelsesdato for enacted, else opdateringsdato
      const issuedDate = sag.afgørelsesdato
        ? sag.afgørelsesdato.substring(0, 10)
        : sag.opdateringsdato?.substring(0, 10) ?? '';

      const ftUrl = `https://www.ft.dk/samling/lovforslag/${sag.nummer?.replace(/\s+/g, '').toLowerCase()}`;

      // Fetch keywords
      let keywords = '';
      try {
        const emneUrl = `${ODA_BASE}/EmneordSag?$filter=sagid eq ${sag.id}&$expand=Emneord`;
        const emneData = await fetchJson<{ value: EmneordSag[] }>(emneUrl);
        keywords = (emneData.value ?? [])
          .map(e => e.Emneord?.emneord)
          .filter(Boolean)
          .join('; ');
      } catch {
        // Keywords are optional; skip on error
      }

      // Insert into DB
      const insertOne = db.transaction(() => {
        insertDoc.run(docId, title, status, issuedDate, ftUrl);

        // Try to link to a statute if enacted
        let statuteId: string | null = null;
        if (isEnacted && sag.lovnummer && sag.lovnummerdato) {
          statuteId = findStatuteId(db, sag.lovnummer, sag.lovnummerdato.substring(0, 10));
        }

        if (statuteId) {
          const fullSummary = [
            `${sag.nummer} — ${statusText}`,
            summary ? `\n\n${summary}` : '',
            keywords ? `\n\nEmneord: ${keywords}` : '',
            sag.lovnummer ? `\n\nLov nr. ${sag.lovnummer} af ${sag.lovnummerdato?.substring(0, 10)}` : '',
          ].join('');

          insertPrepWork.run(statuteId, docId, title, fullSummary);

          // Populate full text in paid tier
          if (insertPrepFull && summary) {
            const prepRow = db.prepare(
              'SELECT id FROM preparatory_works WHERE prep_document_id = ?'
            ).get(docId) as { id: number } | undefined;
            if (prepRow) {
              insertPrepFull.run(prepRow.id, fullSummary);
            }
          }

          linked++;
        }
      });

      try {
        insertOne();
        inserted++;
      } catch (err) {
        skipped++;
      }

      // Pace requests (keywords fetch adds 1 req per lovforslag)
      if (processed % 100 === 0) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    skip += sager.length;

    if (processed % 500 === 0 || processed >= Math.min(totalCount, MAX_ROWS)) {
      console.log(`  [${processed}] inserted=${inserted} linked=${linked} skipped=${skipped} failed=${failed}`);
    }
  }

  // Finalize
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();

  console.log(`\n═══ Folketinget Ingestion Complete ═══`);
  console.log(`  Inserted:      ${inserted}`);
  console.log(`  Linked to law: ${linked}`);
  console.log(`  Skipped:       ${skipped}`);
  console.log(`  Failed:        ${failed}`);
  console.log(`  Database:      ${DB_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
