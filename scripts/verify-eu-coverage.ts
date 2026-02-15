#!/usr/bin/env tsx

/**
 * Verify EU Coverage
 *
 * Verifies that all EU references in the seed data can be successfully imported
 * and reports current coverage statistics.
 *
 * Usage: npm run verify:eu-coverage
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, '../data/database.db');
const EU_REFS_PATH = path.resolve(__dirname, '../data/seed/eu-references.json');

interface CoverageReport {
  totalReferences: number;
  importedReferences: number;
  coverage: number;
  totalEUDocuments: number;
  totalEUDocumentsInSeed: number;
  missingEUDocuments: number;
  uniqueConstraintFailures: number;
}

function verifyEUCoverage(): CoverageReport {
  const db = new Database(DB_PATH, { readonly: true });

  // Load EU references from seed file
  const euData = JSON.parse(fs.readFileSync(EU_REFS_PATH, 'utf-8'));
  const totalReferences = euData.eu_references.length;
  const totalEUDocumentsInSeed = euData.eu_documents.length;

  // Count imported references
  const importedReferences = db.prepare('SELECT COUNT(*) as count FROM eu_references').get() as { count: number };

  // Count EU documents in database
  const totalEUDocuments = db.prepare('SELECT COUNT(*) as count FROM eu_documents').get() as { count: number };

  // Check for missing EU documents
  const uniqueEUDocsInRefs = new Set(euData.eu_references.map((r: any) => r.eu_document_id));
  const existingEUDocs = new Set(
    db.prepare('SELECT id FROM eu_documents').all().map((row: any) => row.id)
  );

  const missingEUDocs = Array.from(uniqueEUDocsInRefs).filter(id => !existingEUDocs.has(id));

  db.close();

  const coverage = Math.round((importedReferences.count / totalReferences) * 10000) / 100;

  return {
    totalReferences,
    importedReferences: importedReferences.count,
    coverage,
    totalEUDocuments: totalEUDocuments.count,
    totalEUDocumentsInSeed,
    missingEUDocuments: missingEUDocs.length,
    uniqueConstraintFailures: totalReferences - importedReferences.count - missingEUDocs.length,
  };
}

function main(): void {
  console.log('EU Coverage Verification\n');

  if (!fs.existsSync(DB_PATH)) {
    console.error(`ERROR: Database not found: ${DB_PATH}`);
    console.error('Run: npm run build:db');
    process.exit(1);
  }

  if (!fs.existsSync(EU_REFS_PATH)) {
    console.error(`ERROR: EU references file not found: ${EU_REFS_PATH}`);
    process.exit(1);
  }

  const report = verifyEUCoverage();

  console.log('Coverage Statistics:');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Total EU References (seed):     ${report.totalReferences}`);
  console.log(`Imported References:            ${report.importedReferences}`);
  console.log(`Coverage:                       ${report.coverage}%`);
  console.log();
  console.log(`Total EU Documents (database):  ${report.totalEUDocuments}`);
  console.log(`Total EU Documents (seed):      ${report.totalEUDocumentsInSeed}`);
  console.log(`Missing EU Documents:           ${report.missingEUDocuments}`);
  console.log();
  console.log(`Skipped References:             ${report.totalReferences - report.importedReferences}`);
  console.log(`  - Missing EU documents:       ${report.totalReferences - report.importedReferences - report.uniqueConstraintFailures}`);
  console.log(`  - Duplicate references:       ${report.uniqueConstraintFailures}`);
  console.log('═══════════════════════════════════════════════════');

  if (report.coverage === 100) {
    console.log('\n✅ Perfect! 100% EU reference coverage achieved!');
  } else if (report.missingEUDocuments === 0 && report.coverage >= 95) {
    console.log('\n✅ Excellent! All EU documents imported.');
    console.log('   (Skipped references are duplicates, which is expected)');
    console.log(`   Coverage: ${report.importedReferences}/${report.totalReferences} references (${report.coverage}%)`);
  } else if (report.coverage >= 90) {
    console.log('\n⚠️  Good coverage, but some EU documents are missing.');
    console.log(`   ${report.missingEUDocuments} EU documents need to be fetched from EUR-Lex.`);
  } else {
    console.log('\n❌ Low coverage. Many EU documents are missing.');
    console.log('   Run: npm run fetch:eurlex -- --missing');
  }

  console.log();
}

main();
