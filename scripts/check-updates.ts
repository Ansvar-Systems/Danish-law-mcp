#!/usr/bin/env tsx
/**
 * Danish Law MCP update monitor.
 *
 * Primary source: Retsinformation API (/v1/Documents).
 * Detects likely updates by comparing changed accessions with local seed-derived DB entries.
 *
 * Usage:
 *   npm run check-updates
 *   npm run check-updates -- --json
 *   npm run check-updates -- --fail-on-updates
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '../data/database.db');

const RETSINFO_URL = 'https://api.retsinformation.dk/v1/Documents';
const USER_AGENT = 'Danish-Law-MCP/1.0.0 (https://github.com/Ansvar-Systems/Denmark-law-mcp)';
const REQUEST_TIMEOUT_MS = 20000;

interface LocalDocument {
  id: string;
  title: string;
  url: string | null;
}

interface RemoteDocument {
  documentId: string;
  accessionsnummer: string;
  reasonForChange: string;
  changeDate: string;
  documentType?: {
    shortName?: string;
    id?: number;
  };
  href?: string;
}

interface UpdateMatch {
  local_id: string;
  local_title: string;
  remote_document_id: string;
  remote_accession: string;
  change_date: string;
  reason: string;
}

interface NewDocument {
  inferred_id: string | null;
  remote_document_id: string;
  remote_accession: string;
  type: string;
  change_date: string;
}

interface UpdateReport {
  checked_at: string;
  local_statutes: number;
  remote_changed_documents: number;
  updates: UpdateMatch[];
  new_documents: NewDocument[];
  errors: string[];
}

function parseArgs(argv: string[]) {
  return {
    json: argv.includes('--json'),
    failOnUpdates: argv.includes('--fail-on-updates'),
  };
}

function parseAccessionFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/accn\/([^/]+)/i);
  return match?.[1] ?? null;
}

function inferLocalIdFromAccession(accession: string): string | null {
  // Typical accession format: B20240100405 -> year=2024, number=1004
  // Suffix is typically a 2-digit variant code.
  const m = accession.match(/^[A-Z](\d{4})(\d+)$/i);
  if (!m) return null;

  const year = m[1];
  const tail = m[2];
  if (tail.length < 3) return null;

  const numberPart = tail.slice(0, -2);
  const number = Number.parseInt(numberPart, 10);
  if (!Number.isFinite(number) || number <= 0) return null;

  return `${year}:${number}`;
}

function isLawLikeDocument(doc: RemoteDocument): boolean {
  const shortName = (doc.documentType?.shortName ?? '').toUpperCase();
  return /^(LOV|LBK|BEK|FOR|ANO|BKI)/.test(shortName);
}

async function fetchChangedDocuments(): Promise<RemoteDocument[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(RETSINFO_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Retsinformation API returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Retsinformation API returned non-array payload');
    }

    return data as RemoteDocument[];
  } finally {
    clearTimeout(timer);
  }
}

function loadLocalStatutes(): LocalDocument[] {
  const db = new Database(DB_PATH, { readonly: true });

  try {
    return db
      .prepare(
        `
        SELECT id, title, url
        FROM legal_documents
        WHERE type = 'statute'
        ORDER BY id
      `,
      )
      .all() as LocalDocument[];
  } finally {
    db.close();
  }
}

function printHumanReport(report: UpdateReport): void {
  console.log('Danish Law MCP - Update Checker');
  console.log('');
  console.log(`Checked at: ${report.checked_at}`);
  console.log(`Local statutes: ${report.local_statutes}`);
  console.log(`Remote changed documents: ${report.remote_changed_documents}`);
  console.log('');

  if (report.errors.length > 0) {
    for (const error of report.errors) {
      console.log(`warning: ${error}`);
    }
    console.log('');
  }

  if (report.updates.length === 0 && report.new_documents.length === 0) {
    console.log('No updates detected from current Retsinformation change feed.');
    return;
  }

  for (const update of report.updates) {
    console.log(
      `UPDATE AVAILABLE: ${update.local_id} (${update.local_title}) -> ${update.remote_accession} (${update.reason}, ${update.change_date})`,
    );
  }

  if (report.new_documents.length > 0) {
    console.log('');
    for (const doc of report.new_documents.slice(0, 25)) {
      const id = doc.inferred_id ?? 'unknown-id';
      console.log(
        `NEW DOCUMENT: ${id} [${doc.type}] -> ${doc.remote_accession} (${doc.change_date})`,
      );
    }
  }

  console.log('');
  console.log(`Updates: ${report.updates.length}`);
  console.log(`New docs: ${report.new_documents.length}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const report: UpdateReport = {
    checked_at: new Date().toISOString(),
    local_statutes: 0,
    remote_changed_documents: 0,
    updates: [],
    new_documents: [],
    errors: [],
  };

  if (!fs.existsSync(DB_PATH)) {
    const message = `Database not found at ${DB_PATH}. Run \"npm run build:db\" first.`;
    if (args.json) {
      process.stdout.write(
        JSON.stringify({ ...report, errors: [...report.errors, message] }, null, 2),
      );
      process.exit(1);
    }
    console.error(message);
    process.exit(1);
  }

  const localDocs = loadLocalStatutes();
  report.local_statutes = localDocs.length;

  const localById = new Map(localDocs.map(doc => [doc.id, doc]));
  const localAccessionById = new Map(
    localDocs.map(doc => [doc.id, parseAccessionFromUrl(doc.url)]),
  );
  const localAccessions = new Set(
    localDocs
      .map(doc => parseAccessionFromUrl(doc.url))
      .filter((v): v is string => Boolean(v)),
  );

  let remoteDocs: RemoteDocument[] = [];
  try {
    remoteDocs = await fetchChangedDocuments();
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
  }

  const changedLawDocs = remoteDocs.filter(isLawLikeDocument);
  report.remote_changed_documents = changedLawDocs.length;

  const seenUpdateKeys = new Set<string>();
  const seenNewKeys = new Set<string>();

  for (const remote of changedLawDocs) {
    const inferredId = inferLocalIdFromAccession(remote.accessionsnummer);

    if (inferredId && localById.has(inferredId)) {
      const localDoc = localById.get(inferredId)!;
      const localAccession = localAccessionById.get(inferredId);

      const accessionChanged =
        localAccession && localAccession !== remote.accessionsnummer;

      const reasonSuggestsChange =
        /Changed|Created|MetadataChanged/i.test(remote.reasonForChange);

      if (accessionChanged || reasonSuggestsChange) {
        const key = `${inferredId}:${remote.accessionsnummer}`;
        if (!seenUpdateKeys.has(key)) {
          seenUpdateKeys.add(key);
          report.updates.push({
            local_id: inferredId,
            local_title: localDoc.title,
            remote_document_id: remote.documentId,
            remote_accession: remote.accessionsnummer,
            change_date: remote.changeDate,
            reason: remote.reasonForChange,
          });
        }
      }
      continue;
    }

    if (localAccessions.has(remote.accessionsnummer)) {
      // Same accession already present locally, ignore.
      continue;
    }

    const newKey = `${remote.documentId}:${remote.accessionsnummer}`;
    if (!seenNewKeys.has(newKey)) {
      seenNewKeys.add(newKey);
      report.new_documents.push({
        inferred_id: inferredId,
        remote_document_id: remote.documentId,
        remote_accession: remote.accessionsnummer,
        type: remote.documentType?.shortName ?? 'unknown',
        change_date: remote.changeDate,
      });
    }
  }

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHumanReport(report);
  }

  if (args.failOnUpdates && (report.updates.length > 0 || report.new_documents.length > 0)) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-updates failed: ${message}`);
  process.exit(1);
});
