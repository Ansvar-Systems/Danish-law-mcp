#!/usr/bin/env tsx
/**
 * Seed data quality audit.
 *
 * Reports provision-level duplication/collision rates and basic coverage
 * statistics per seed file.
 *
 * Usage:
 *   node --import tsx scripts/audit-seeds.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

interface SeedProvision {
  provision_ref: string;
  title?: string;
  content: string;
}

interface SeedDocument {
  id: string;
  type: string;
  provisions?: SeedProvision[];
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const seedDir = path.resolve(__dirname, '../data/seed');

if (!fs.existsSync(seedDir)) {
  console.error(`Seed directory missing: ${seedDir}`);
  process.exit(1);
}

const files = fs.readdirSync(seedDir)
  .filter(f => f.endsWith('.json') && !f.startsWith('_') && !f.startsWith('.'))
  .sort();

let totalDocs = 0;
let totalProvisions = 0;
let totalDuplicateRefs = 0;
let totalConflictingDuplicates = 0;
let totalTitles = 0;

console.log('Seed Quality Audit\n');

for (const file of files) {
  const filePath = path.join(seedDir, file);
  const raw = fs.readFileSync(filePath, 'utf8');
  const doc = JSON.parse(raw) as SeedDocument;

  if (!doc.provisions || doc.provisions.length === 0) {
    continue;
  }

  totalDocs++;
  totalProvisions += doc.provisions.length;
  totalTitles += doc.provisions.filter(p => (p.title ?? '').trim().length > 0).length;

  const byRef = new Map<string, string[]>();
  for (const p of doc.provisions) {
    const ref = p.provision_ref.trim();
    const text = normalizeWhitespace(p.content);
    const list = byRef.get(ref);
    if (list) {
      list.push(text);
    } else {
      byRef.set(ref, [text]);
    }
  }

  let duplicateRefs = 0;
  let conflictingDuplicates = 0;
  for (const texts of byRef.values()) {
    if (texts.length <= 1) {
      continue;
    }
    duplicateRefs += texts.length - 1;
    const uniqueTexts = new Set(texts);
    if (uniqueTexts.size > 1) {
      conflictingDuplicates += texts.length - 1;
    }
  }

  totalDuplicateRefs += duplicateRefs;
  totalConflictingDuplicates += conflictingDuplicates;

  if (duplicateRefs > 0) {
    console.log(
      `${file}: provisions=${doc.provisions.length}, ` +
      `duplicate_refs=${duplicateRefs}, conflicting_duplicates=${conflictingDuplicates}`
    );
  }
}

console.log('\nSummary');
console.log(`  documents: ${totalDocs}`);
console.log(`  provisions: ${totalProvisions}`);
console.log(`  provisions_with_titles: ${totalTitles}`);
console.log(`  duplicate_refs: ${totalDuplicateRefs}`);
console.log(`  conflicting_duplicates: ${totalConflictingDuplicates}`);

