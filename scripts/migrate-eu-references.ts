#!/usr/bin/env tsx
/**
 * EU References Migration Script
 *
 * Migrates the database to add EU reference tracking tables.
 * Safe to run multiple times - checks if migration has already been applied.
 *
 * Usage: npm run migrate:eu-references
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../data/database.db');

interface MigrationStatus {
  applied: boolean;
  timestamp?: string;
  version?: string;
}

function checkMigrationStatus(db: Database.Database): MigrationStatus {
  try {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='eu_documents'
    `).all();

    if (tables.length === 0) {
      return { applied: false };
    }

    return {
      applied: true,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  } catch (error) {
    return { applied: false };
  }
}

function applyMigration(db: Database.Database): void {
  console.log('Applying EU references migration...\n');

  const migration = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS eu_documents (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('directive', 'regulation')),
        year INTEGER NOT NULL CHECK (year >= 1957 AND year <= 2100),
        number INTEGER NOT NULL CHECK (number > 0),
        community TEXT CHECK (community IN ('EU', 'EG', 'EEG', 'Euratom')),
        celex_number TEXT,
        title TEXT,
        title_sv TEXT,
        short_name TEXT,
        adoption_date TEXT,
        entry_into_force_date TEXT,
        in_force BOOLEAN DEFAULT 1,
        amended_by TEXT,
        repeals TEXT,
        url_eur_lex TEXT,
        description TEXT,
        last_updated TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_eu_documents_type_year
      ON eu_documents(type, year DESC);

      CREATE INDEX IF NOT EXISTS idx_eu_documents_celex
      ON eu_documents(celex_number);

      CREATE TABLE IF NOT EXISTS eu_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL CHECK (source_type IN ('provision', 'document', 'case_law')),
        source_id TEXT NOT NULL,
        document_id TEXT NOT NULL REFERENCES legal_documents(id),
        provision_id INTEGER REFERENCES legal_provisions(id),
        eu_document_id TEXT NOT NULL REFERENCES eu_documents(id),
        eu_article TEXT,
        reference_type TEXT NOT NULL CHECK (reference_type IN (
          'implements', 'supplements', 'applies', 'references', 'complies_with',
          'derogates_from', 'amended_by', 'repealed_by', 'cites_article'
        )),
        reference_context TEXT,
        full_citation TEXT,
        is_primary_implementation BOOLEAN DEFAULT 0,
        implementation_status TEXT CHECK (implementation_status IN ('complete', 'partial', 'pending', 'unknown')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_verified TEXT,
        UNIQUE(source_id, eu_document_id, eu_article)
      );

      CREATE INDEX IF NOT EXISTS idx_eu_references_document
      ON eu_references(document_id, eu_document_id);

      CREATE INDEX IF NOT EXISTS idx_eu_references_eu_document
      ON eu_references(eu_document_id, document_id);

      CREATE INDEX IF NOT EXISTS idx_eu_references_provision
      ON eu_references(provision_id, eu_document_id);

      CREATE INDEX IF NOT EXISTS idx_eu_references_primary
      ON eu_references(eu_document_id, is_primary_implementation)
      WHERE is_primary_implementation = 1;

      CREATE TABLE IF NOT EXISTS eu_reference_keywords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eu_reference_id INTEGER NOT NULL REFERENCES eu_references(id) ON DELETE CASCADE,
        keyword TEXT NOT NULL,
        position INTEGER,
        UNIQUE(eu_reference_id, keyword)
      );
    `);

    console.log('✓ Created tables and indexes');
  });

  migration();
}

function main(): void {
  console.log('EU References Migration Tool\n');
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  try {
    const status = checkMigrationStatus(db);
    if (status.applied) {
      console.log('Migration already applied.');
      return;
    }
    applyMigration(db);
    console.log('\nMigration complete.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
