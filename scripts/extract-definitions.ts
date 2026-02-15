#!/usr/bin/env tsx
/**
 * Extract legal term definitions from Danish statutes and populate the definitions table.
 *
 * Identifies definition patterns in provision text and extracts:
 * - term: The legal term being defined
 * - definition: The definition text
 * - source_provision: Which provision it comes from
 * - document_id: Which statute
 *
 * Usage: npm run extract:definitions
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const DB_PATH = path.resolve(__dirname, '../data/database.db');

interface DocumentSeed {
  id: string;
  type: string;
  title: string;
  short_name?: string;
  provisions?: ProvisionSeed[];
}

interface ProvisionSeed {
  provision_ref: string;
  chapter?: string;
  section: string;
  content: string;
}

interface ExtractedDefinition {
  document_id: string;
  term: string;
  definition: string;
  source_provision: string;
}

// Priority statutes to focus on first
const PRIORITY_STATUTES = [
  'dataskyddslagen.json',
  'offentlighets-sekretesslagen.json',
  'brottsbalken.json',
  'arbetsmiljolagen.json',
  'personuppgiftslagen.json',
  'miljobalken.json',
  'aktiebolagslagen.json',
  'las-anstallningsskydd.json',
  'forvaltningslagen.json',
  'plan-bygglagen.json',
];

/**
 * Definition patterns in Swedish legal text
 */
const DEFINITION_PATTERNS = [
  // "Med X avses i denna lag/balk..." (most common)
  {
    regex: /Med\s+([^.]+?)\s+avses\s+i\s+denna\s+(?:lag|balk|förordning)\s+([^.]+?)\./g,
    termGroup: 1,
    definitionGroup: 2,
  },
  // "Med X avses..." (general)
  {
    regex: /Med\s+([^.]+?)\s+avses\s+([^.]+?)\./g,
    termGroup: 1,
    definitionGroup: 2,
  },
  // "Med X menas i denna lag/balk..."
  {
    regex: /Med\s+([^.]+?)\s+menas\s+i\s+denna\s+(?:lag|balk|förordning)\s+([^.]+?)\./g,
    termGroup: 1,
    definitionGroup: 2,
  },
  // "Med X menas..." (general)
  {
    regex: /Med\s+([^.]+?)\s+menas\s+([^.]+?)\./g,
    termGroup: 1,
    definitionGroup: 2,
  },
  // "Med X förstås i denna balk/lag..."
  {
    regex: /Med\s+([^.]+?)\s+förstås\s+i\s+denna\s+(?:lag|balk|förordning)\s+([^.]+?)\./g,
    termGroup: 1,
    definitionGroup: 2,
  },
  // "I denna lag avses med X..." (inverted form)
  {
    regex: /I\s+denna\s+(?:lag|förordning|balk)\s+avses\s+med\s+([^.]+?)\s+([^.]+?)\./g,
    termGroup: 1,
    definitionGroup: 2,
  },
];

/**
 * Clean up extracted text
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

/**
 * Extract term from a definition phrase
 */
function extractTerm(text: string): string {
  let term = cleanText(text);

  // Remove common prefixes
  term = term.replace(/^(?:i\s+denna\s+(?:lag|balk|förordning)\s+)?med\s+/i, '');
  term = term.replace(/^i\s+denna\s+(?:lag|balk|förordning)\s+/i, '');

  // Remove trailing "avses" or "menas"
  term = term.replace(/\s+(?:avses|menas)$/i, '');

  // Capitalize first letter
  if (term.length > 0) {
    term = term.charAt(0).toUpperCase() + term.slice(1);
  }

  return term;
}

/**
 * Extract definition text, cleaning up artifacts
 */
function extractDefinition(text: string): string {
  let definition = cleanText(text);

  // Remove leading "i denna lag" if present
  definition = definition.replace(/^i\s+denna\s+(?:lag|balk|förordning|kapitel)\s+/i, '');

  // Remove trailing provision metadata like "Lag (2018:218)"
  definition = definition.replace(/\s+Lag\s+\(\d{4}:\d+\)\.?$/i, '');

  // Ensure definition ends with period
  if (!definition.match(/[.!?]$/)) {
    definition += '.';
  }

  return definition;
}

/**
 * Validate if a definition is high-quality
 */
function isValidDefinition(term: string, definition: string): boolean {
  // Term should be reasonable length
  if (term.length < 3 || term.length > 150) return false;

  // Definition should be substantial
  if (definition.length < 10 || definition.length > 5000) return false;

  // Skip if definition is just a reference
  if (definition.match(/^(?:se|jfr|jämför)\s+\d+/i)) return false;

  // Skip if definition is just a number or enumeration start
  if (definition.match(/^(?:\d+\.?\s*|[a-z]\)\s*)$/)) return false;

  // Skip definitions that are just "i detta kapitel 1" or similar incomplete enumerations
  if (definition.match(/^i\s+(?:detta|denna)\s+(?:kapitel|lag|balk)\s+\d+\.?\s*$/i)) return false;

  // Definition should have at least some words (not just references)
  const wordCount = definition.split(/\s+/).filter(w => w.length > 2).length;
  if (wordCount < 3) return false;

  return true;
}

/**
 * Check if a provision likely contains definitions
 */
function isLikelyDefinitionProvision(provision: ProvisionSeed): boolean {
  const content = provision.content.toLowerCase();

  // Contains definition keywords
  const hasDefinitionKeywords = (
    content.includes('med ') &&
    (content.includes('avses') || content.includes('menas') || content.includes('förstås'))
  ) || (
    content.includes('i denna') &&
    (content.includes('avses') || content.includes('menas'))
  ) || (
    content.includes('definitioner')
  );

  return hasDefinitionKeywords;
}

/**
 * Extract definitions from a single provision
 */
function extractDefinitionsFromProvision(
  provision: ProvisionSeed,
  documentId: string
): ExtractedDefinition[] {
  const definitions: ExtractedDefinition[] = [];
  const content = provision.content;

  // Try each pattern
  for (const pattern of DEFINITION_PATTERNS) {
    const matches = Array.from(content.matchAll(pattern.regex));

    for (const match of matches) {
      const rawTerm = match[pattern.termGroup];
      const rawDefinition = match[pattern.definitionGroup];

      if (!rawTerm || !rawDefinition) continue;

      const term = extractTerm(rawTerm);
      const definition = extractDefinition(rawDefinition);

      // Validate definition quality
      if (!isValidDefinition(term, definition)) continue;

      definitions.push({
        document_id: documentId,
        term,
        definition,
        source_provision: provision.provision_ref,
      });
    }
  }

  return definitions;
}

/**
 * Extract definitions from a statute document
 */
function extractDefinitionsFromDocument(seed: DocumentSeed): ExtractedDefinition[] {
  const definitions: ExtractedDefinition[] = [];

  if (!seed.provisions) return definitions;

  // Focus on likely definition provisions first (chapter 1, early sections)
  const likelyProvisions = seed.provisions.filter(isLikelyDefinitionProvision);

  for (const provision of likelyProvisions) {
    const extracted = extractDefinitionsFromProvision(provision, seed.id);
    definitions.push(...extracted);
  }

  return definitions;
}

/**
 * Deduplicate definitions (same document + term)
 */
function deduplicateDefinitions(definitions: ExtractedDefinition[]): ExtractedDefinition[] {
  const seen = new Map<string, ExtractedDefinition>();

  for (const def of definitions) {
    const key = `${def.document_id}|${def.term}`;

    if (!seen.has(key)) {
      seen.set(key, def);
    } else {
      // Keep the longer/more detailed definition
      const existing = seen.get(key)!;
      if (def.definition.length > existing.definition.length) {
        seen.set(key, def);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Main extraction logic
 */
function extractDefinitions(): void {
  console.log('Extracting legal term definitions from statutes...\n');

  if (!fs.existsSync(SEED_DIR)) {
    console.error(`Seed directory not found: ${SEED_DIR}`);
    process.exit(1);
  }

  // Load all seed files
  const allFiles = fs.readdirSync(SEED_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('.') && !f.startsWith('_'));

  // Prioritize key statutes
  const priorityFiles = allFiles.filter(f => PRIORITY_STATUTES.includes(f));
  const otherFiles = allFiles.filter(f => !PRIORITY_STATUTES.includes(f));
  const seedFiles = [...priorityFiles, ...otherFiles];

  console.log(`Found ${seedFiles.length} statute files (${priorityFiles.length} priority)`);

  const allDefinitions: ExtractedDefinition[] = [];
  let processedFiles = 0;

  for (const file of seedFiles) {
    const filePath = path.join(SEED_DIR, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const seed = JSON.parse(content) as DocumentSeed;

      // Skip non-statute documents (case law, etc.)
      if (seed.type !== 'statute') continue;

      const definitions = extractDefinitionsFromDocument(seed);

      if (definitions.length > 0) {
        const shortName = seed.short_name || seed.id;
        console.log(`  ${shortName}: Found ${definitions.length} definitions`);
        allDefinitions.push(...definitions);
      }

      processedFiles++;
    } catch (error) {
      console.error(`  Error processing ${file}:`, error);
    }
  }

  // Deduplicate
  const uniqueDefinitions = deduplicateDefinitions(allDefinitions);
  console.log(`\nExtracted ${uniqueDefinitions.length} unique definitions from ${processedFiles} statutes`);

  // Insert into database
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    console.error('Run "npm run build:db" first');
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  const insertDefinition = db.prepare(`
    INSERT OR IGNORE INTO definitions (document_id, term, definition, source_provision)
    VALUES (?, ?, ?, ?)
  `);

  const insertAll = db.transaction(() => {
    let inserted = 0;
    for (const def of uniqueDefinitions) {
      const result = insertDefinition.run(
        def.document_id,
        def.term,
        def.definition,
        def.source_provision
      );
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });

  const inserted = insertAll();
  db.close();

  console.log(`\nInserted ${inserted} definitions into database`);

  // Show sample definitions
  if (uniqueDefinitions.length > 0) {
    console.log('\nSample definitions:');
    for (let i = 0; i < Math.min(5, uniqueDefinitions.length); i++) {
      const def = uniqueDefinitions[i];
      const preview = def.definition.substring(0, 80) + (def.definition.length > 80 ? '...' : '');
      console.log(`  - ${def.term}: ${preview}`);
      console.log(`    (${def.document_id} ${def.source_provision})`);
    }
  }
}

extractDefinitions();
