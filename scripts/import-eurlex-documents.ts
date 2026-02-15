#!/usr/bin/env tsx

/**
 * Import EUR-Lex Documents
 *
 * Imports EU documents fetched from EUR-Lex into the database.
 * Safe to run multiple times - uses INSERT OR REPLACE to avoid duplicates.
 *
 * Usage: npm run import:eurlex-documents
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../data/database.db');
const EURLEX_DOCS_PATH = path.resolve(__dirname, '../data/seed/eurlex-documents.json');

interface EURLexDocument {
  id: string;
  type: 'directive' | 'regulation';
  year: number;
  number: number;
  community: 'EU' | 'EG' | 'EEG';
  celex_number: string;
  title?: string;
  title_sv?: string;
  date_document?: string;
  in_force?: boolean;
  url?: string;
  fetched_at: string;
  source: 'eurlex';
}

function importEURLexDocuments(db: Database.Database): void {
  console.log('Importing EUR-Lex documents into database...\n');

  if (!fs.existsSync(EURLEX_DOCS_PATH)) {
    console.error(`ERROR: EUR-Lex documents file not found: ${EURLEX_DOCS_PATH}`);
    console.error('Run: npm run fetch:eurlex -- --missing');
    process.exit(1);
  }

  const documents = JSON.parse(fs.readFileSync(EURLEX_DOCS_PATH, 'utf-8')) as EURLexDocument[];
  console.log(`Found ${documents.length} EUR-Lex documents to import`);

  const insertDoc = db.prepare(`
    INSERT OR REPLACE INTO eu_documents (
      id,
      type,
      year,
      number,
      community,
      celex_number,
      title,
      title_sv,
      adoption_date,
      in_force,
      url_eur_lex,
      last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const transaction = db.transaction((docs: EURLexDocument[]) => {
    let inserted = 0;
    let updated = 0;

    for (const doc of docs) {
      try {
        // Check if document already exists
        const existing = db.prepare('SELECT id FROM eu_documents WHERE id = ?').get(doc.id);

        insertDoc.run(
          doc.id,
          doc.type,
          doc.year,
          doc.number,
          doc.community,
          doc.celex_number,
          doc.title || null,
          doc.title_sv || null,
          doc.date_document || null,
          doc.in_force ? 1 : 0,
          doc.url || null
        );

        if (existing) {
          updated++;
        } else {
          inserted++;
        }
      } catch (error: any) {
        console.error(`  ✗ Failed to import ${doc.id}: ${error.message}`);
      }
    }

    console.log(`\n✓ Inserted: ${inserted} documents`);
    console.log(`✓ Updated:  ${updated} documents`);
  });

  transaction(documents);
}

function verifyImport(db: Database.Database): void {
  console.log('\nVerifying import...');

  const totalEUDocs = db.prepare('SELECT COUNT(*) as count FROM eu_documents').get() as { count: number };
  console.log(`Total EU documents in database: ${totalEUDocs.count}`);

  // Check how many references can now be imported
  const euRefsPath = path.resolve(__dirname, '../data/seed/eu-references.json');
  if (fs.existsSync(euRefsPath)) {
    const euData = JSON.parse(fs.readFileSync(euRefsPath, 'utf-8'));
    const totalRefs = euData.eu_references.length;

    // Count how many references have valid EU documents now
    const validRefs = db.prepare(`
      SELECT COUNT(*) as count
      FROM json_each(?)
      WHERE json_extract(value, '$.eu_document_id') IN (SELECT id FROM eu_documents)
    `).get(JSON.stringify(euData.eu_references)) as { count: number };

    console.log(`Total EU references in seed: ${totalRefs}`);
    console.log(`References with valid EU documents: ${validRefs.count} (${Math.round(100 * validRefs.count / totalRefs)}%)`);

    if (validRefs.count === totalRefs) {
      console.log('✅ All EU references now have valid EU documents!');
    } else {
      const missing = totalRefs - validRefs.count;
      console.log(`⚠️  Still missing ${missing} EU documents`);
    }
  }
}

function main(): void {
  console.log('EUR-Lex Documents Import Tool\n');

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  try {
    // Check if eu_documents table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='eu_documents'
    `).get();

    if (!tableExists) {
      console.error('ERROR: eu_documents table does not exist.');
      console.error('Run: npm run migrate:eu-references');
      process.exit(1);
    }

    importEURLexDocuments(db);
    verifyImport(db);

    console.log('\n✅ Import complete!');
    console.log('\nNext steps:');
    console.log('  1. Re-import EU references: npm run build:db');
    console.log('  2. Verify coverage: npm run verify:eu-coverage');
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
