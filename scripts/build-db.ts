#!/usr/bin/env tsx
/**
 * Database builder for Danish Legal Citation MCP server.
 *
 * Builds the SQLite database from seed JSON files in data/seed/.
 *
 * Usage: npm run build:db
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEED_DIR = path.resolve(__dirname, '../data/seed');
const DB_PATH = path.resolve(__dirname, '../data/database.db');

// ─────────────────────────────────────────────────────────────────────────────
// Seed file types
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentSeed {
  id: string;
  type: 'statute' | 'bill' | 'sou' | 'ds' | 'case_law';
  title: string;
  title_en?: string;
  short_name?: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date?: string;
  in_force_date?: string;
  url?: string;
  description?: string;
  provisions?: ProvisionSeed[];
  provision_versions?: ProvisionVersionSeed[];
  definitions?: DefinitionSeed[];
  preparatory_works?: PrepWorkSeed[];
  case_law?: CaseLawSeed;
}

interface ProvisionSeed {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  valid_from?: string;
  valid_to?: string;
}

interface ProvisionVersionSeed {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
  metadata?: Record<string, unknown>;
  valid_from?: string;
  valid_to?: string;
}

interface DefinitionSeed {
  term: string;
  term_en?: string;
  definition: string;
  source_provision?: string;
}

interface PrepWorkSeed {
  prep_document_id: string;
  title: string;
  summary?: string;
}

interface CaseLawSeed {
  court: string;
  case_number?: string;
  decision_date?: string;
  summary?: string;
  keywords?: string;
  cited_statutes?: string[];
}

interface CrossRefSeed {
  source_document_id: string;
  source_provision_ref?: string;
  target_document_id: string;
  target_provision_ref?: string;
  ref_type: string;
}

interface ProvisionDedupStats {
  duplicate_refs: number;
  conflicting_duplicates: number;
}

interface PendingPrepWork {
  statute_id: string;
  prep_document_id: string;
  title: string;
  summary?: string;
}

interface EUDocumentSeed {
  id: string;
  type: 'directive' | 'regulation';
  year: number;
  number: number;
  community?: string;
  celex_number?: string;
  title?: string;
  title_sv?: string;
  short_name?: string;
  adoption_date?: string;
  entry_into_force_date?: string;
  in_force?: boolean;
  amended_by?: string;
  repeals?: string;
  url_eur_lex?: string;
  description?: string;
}

interface EUReferenceSeed {
  source_type: 'provision' | 'document' | 'case_law';
  source_id: string;
  document_id: string;
  provision_ref?: string;
  eu_document_id: string;
  eu_article?: string;
  reference_type: string;
  reference_context?: string;
  full_citation?: string;
  is_primary_implementation?: boolean;
  implementation_status?: string;
}

interface EUSeedData {
  eu_documents: EUDocumentSeed[];
  eu_references: EUReferenceSeed[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Database schema
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA = `
-- Legal documents (statutes, bills, SOUs, case law)
CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('statute', 'bill', 'sou', 'ds', 'case_law')),
  title TEXT NOT NULL,
  title_en TEXT,
  short_name TEXT,
  status TEXT NOT NULL DEFAULT 'in_force'
    CHECK(status IN ('in_force', 'amended', 'repealed', 'not_yet_in_force')),
  issued_date TEXT,
  in_force_date TEXT,
  url TEXT,
  description TEXT,
  last_updated TEXT DEFAULT (datetime('now'))
);

-- Individual provisions from statutes
CREATE TABLE legal_provisions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,
  chapter TEXT,
  section TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  UNIQUE(document_id, provision_ref)
);

CREATE INDEX idx_provisions_doc ON legal_provisions(document_id);
CREATE INDEX idx_provisions_chapter ON legal_provisions(document_id, chapter);

-- FTS5 for provision search
CREATE VIRTUAL TABLE provisions_fts USING fts5(
  content, title,
  content='legal_provisions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER provisions_ai AFTER INSERT ON legal_provisions BEGIN
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TRIGGER provisions_ad AFTER DELETE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
END;

CREATE TRIGGER provisions_au AFTER UPDATE ON legal_provisions BEGIN
  INSERT INTO provisions_fts(provisions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
  INSERT INTO provisions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

-- Historical provision versions for date-aware lookups
CREATE TABLE legal_provision_versions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,
  chapter TEXT,
  section TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  valid_from TEXT,
  valid_to TEXT
);

CREATE INDEX idx_provision_versions_doc_ref
  ON legal_provision_versions(document_id, provision_ref);
CREATE INDEX idx_provision_versions_window
  ON legal_provision_versions(valid_from, valid_to);

CREATE VIRTUAL TABLE provision_versions_fts USING fts5(
  content, title,
  content='legal_provision_versions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER provision_versions_ai AFTER INSERT ON legal_provision_versions BEGIN
  INSERT INTO provision_versions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

CREATE TRIGGER provision_versions_ad AFTER DELETE ON legal_provision_versions BEGIN
  INSERT INTO provision_versions_fts(provision_versions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
END;

CREATE TRIGGER provision_versions_au AFTER UPDATE ON legal_provision_versions BEGIN
  INSERT INTO provision_versions_fts(provision_versions_fts, rowid, content, title)
  VALUES ('delete', old.id, old.content, old.title);
  INSERT INTO provision_versions_fts(rowid, content, title)
  VALUES (new.id, new.content, new.title);
END;

-- Case law metadata
CREATE TABLE case_law (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL UNIQUE REFERENCES legal_documents(id),
  court TEXT NOT NULL,
  case_number TEXT,
  decision_date TEXT,
  summary TEXT,
  keywords TEXT
);

-- FTS5 for case law search
CREATE VIRTUAL TABLE case_law_fts USING fts5(
  summary, keywords,
  content='case_law',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER case_law_ai AFTER INSERT ON case_law BEGIN
  INSERT INTO case_law_fts(rowid, summary, keywords)
  VALUES (new.id, new.summary, new.keywords);
END;

CREATE TRIGGER case_law_ad AFTER DELETE ON case_law BEGIN
  INSERT INTO case_law_fts(case_law_fts, rowid, summary, keywords)
  VALUES ('delete', old.id, old.summary, old.keywords);
END;

CREATE TRIGGER case_law_au AFTER UPDATE ON case_law BEGIN
  INSERT INTO case_law_fts(case_law_fts, rowid, summary, keywords)
  VALUES ('delete', old.id, old.summary, old.keywords);
  INSERT INTO case_law_fts(rowid, summary, keywords)
  VALUES (new.id, new.summary, new.keywords);
END;

-- Preparatory works (forarbeten) linking statutes to bills/SOUs
CREATE TABLE preparatory_works (
  id INTEGER PRIMARY KEY,
  statute_id TEXT NOT NULL REFERENCES legal_documents(id),
  prep_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  title TEXT,
  summary TEXT
);

CREATE INDEX idx_prep_statute ON preparatory_works(statute_id);

-- FTS5 for preparatory works search
CREATE VIRTUAL TABLE prep_works_fts USING fts5(
  title, summary,
  content='preparatory_works',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER prep_works_ai AFTER INSERT ON preparatory_works BEGIN
  INSERT INTO prep_works_fts(rowid, title, summary)
  VALUES (new.id, new.title, new.summary);
END;

CREATE TRIGGER prep_works_ad AFTER DELETE ON preparatory_works BEGIN
  INSERT INTO prep_works_fts(prep_works_fts, rowid, title, summary)
  VALUES ('delete', old.id, old.title, old.summary);
END;

CREATE TRIGGER prep_works_au AFTER UPDATE ON preparatory_works BEGIN
  INSERT INTO prep_works_fts(prep_works_fts, rowid, title, summary)
  VALUES ('delete', old.id, old.title, old.summary);
  INSERT INTO prep_works_fts(rowid, title, summary)
  VALUES (new.id, new.title, new.summary);
END;

-- Cross-references between provisions/documents
CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  source_provision_ref TEXT,
  target_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  target_provision_ref TEXT,
  ref_type TEXT NOT NULL DEFAULT 'references'
    CHECK(ref_type IN ('references', 'amended_by', 'implements', 'see_also'))
);

CREATE INDEX idx_xref_source ON cross_references(source_document_id);
CREATE INDEX idx_xref_target ON cross_references(target_document_id);

-- Legal term definitions
CREATE TABLE definitions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  term TEXT NOT NULL,
  term_en TEXT,
  definition TEXT NOT NULL,
  source_provision TEXT,
  UNIQUE(document_id, term)
);

-- FTS5 for definition search
CREATE VIRTUAL TABLE definitions_fts USING fts5(
  term, definition,
  content='definitions',
  content_rowid='id',
  tokenize='unicode61'
);

CREATE TRIGGER definitions_ai AFTER INSERT ON definitions BEGIN
  INSERT INTO definitions_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;

CREATE TRIGGER definitions_ad AFTER DELETE ON definitions BEGIN
  INSERT INTO definitions_fts(definitions_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
END;

CREATE TRIGGER definitions_au AFTER UPDATE ON definitions BEGIN
  INSERT INTO definitions_fts(definitions_fts, rowid, term, definition)
  VALUES ('delete', old.id, old.term, old.definition);
  INSERT INTO definitions_fts(rowid, term, definition)
  VALUES (new.id, new.term, new.definition);
END;

-- =============================================================================
-- EU REFERENCES SCHEMA
-- =============================================================================
-- Tracks cross-references between Danish law and EU directives/regulations

-- EU Documents (directives and regulations)
CREATE TABLE eu_documents (
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

CREATE INDEX idx_eu_documents_type_year ON eu_documents(type, year DESC);
CREATE INDEX idx_eu_documents_celex ON eu_documents(celex_number);

-- EU References (links Danish provisions to EU documents)
CREATE TABLE eu_references (
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

CREATE INDEX idx_eu_references_document ON eu_references(document_id, eu_document_id);
CREATE INDEX idx_eu_references_eu_document ON eu_references(eu_document_id, document_id);
CREATE INDEX idx_eu_references_provision ON eu_references(provision_id, eu_document_id);
CREATE INDEX idx_eu_references_primary ON eu_references(eu_document_id, is_primary_implementation)
  WHERE is_primary_implementation = 1;

-- EU Reference Keywords (implementation keywords found in Danish law)
CREATE TABLE eu_reference_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eu_reference_id INTEGER NOT NULL REFERENCES eu_references(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  position INTEGER,
  UNIQUE(eu_reference_id, keyword)
);

-- =============================================================================
-- EU REFERENCES VIEWS
-- =============================================================================

-- View: Danish statutes implementing each EU directive
CREATE VIEW v_eu_implementations AS
SELECT
  ed.id AS eu_document_id,
  ed.type,
  ed.year,
  ed.number,
  ed.title,
  ed.short_name,
  ld.id AS document_id,
  ld.title AS danish_title,
  ld.short_name AS danish_short_name,
  er.reference_type,
  er.is_primary_implementation,
  er.implementation_status
FROM eu_documents ed
JOIN eu_references er ON ed.id = er.eu_document_id
JOIN legal_documents ld ON er.document_id = ld.id
WHERE ed.type = 'directive'
ORDER BY ed.year DESC, ed.number, ld.id;

-- View: EU regulations applied in Danish law
CREATE VIEW v_eu_regulations_applied AS
SELECT
  ed.id AS eu_document_id,
  ed.year,
  ed.number,
  ed.title,
  ed.short_name,
  COUNT(DISTINCT er.document_id) AS danish_statute_count,
  COUNT(er.id) AS total_references
FROM eu_documents ed
JOIN eu_references er ON ed.id = er.eu_document_id
WHERE ed.type = 'regulation'
GROUP BY ed.id
ORDER BY total_references DESC;

-- View: Danish statutes with most EU references
CREATE VIEW v_statutes_by_eu_references AS
SELECT
  ld.id AS document_id,
  ld.title,
  ld.short_name,
  COUNT(DISTINCT er.eu_document_id) AS eu_document_count,
  COUNT(er.id) AS total_references,
  SUM(CASE WHEN ed.type = 'directive' THEN 1 ELSE 0 END) AS directive_count,
  SUM(CASE WHEN ed.type = 'regulation' THEN 1 ELSE 0 END) AS regulation_count
FROM legal_documents ld
JOIN eu_references er ON ld.id = er.document_id
JOIN eu_documents ed ON er.eu_document_id = ed.id
WHERE ld.type = 'statute'
GROUP BY ld.id
ORDER BY total_references DESC;

-- Build metadata (tier, schema version, build timestamp)
CREATE TABLE db_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- View: GDPR implementations in Danish law
CREATE VIEW v_gdpr_implementations AS
SELECT
  ld.id AS document_id,
  ld.title,
  lp.provision_ref,
  lp.content,
  er.eu_article,
  er.reference_type
FROM eu_documents ed
JOIN eu_references er ON ed.id = er.eu_document_id
JOIN legal_documents ld ON er.document_id = ld.id
LEFT JOIN legal_provisions lp ON er.provision_id = lp.id
WHERE ed.id = 'regulation:2016/679'
ORDER BY ld.id, lp.provision_ref;
`;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractRepealDateFromDescription(description: string | undefined): string | undefined {
  if (!description) {
    return undefined;
  }
  const match = description.match(/(?:Upphävd|Ophævet)\s+(\d{4}-\d{2}-\d{2})/i);
  return match?.[1];
}

function deriveDocumentValidityWindow(seed: DocumentSeed): { validFrom: string | null; validTo: string | null } {
  return {
    validFrom: seed.in_force_date ?? seed.issued_date ?? null,
    validTo: seed.status === 'repealed' ? extractRepealDateFromDescription(seed.description) ?? null : null,
  };
}

function isoDateValue(date: string | undefined): number {
  if (!date) {
    return Number.NEGATIVE_INFINITY;
  }
  return Date.parse(`${date}T00:00:00Z`);
}

function selectLatestProvisionVersions(versions: ProvisionVersionSeed[]): ProvisionSeed[] {
  const byRef = new Map<string, ProvisionVersionSeed>();

  for (const version of versions) {
    const existing = byRef.get(version.provision_ref);
    if (!existing || isoDateValue(version.valid_from) > isoDateValue(existing.valid_from)) {
      byRef.set(version.provision_ref, version);
    }
  }

  return Array.from(byRef.values()).map(v => ({
    provision_ref: v.provision_ref,
    chapter: v.chapter,
    section: v.section,
    title: v.title,
    content: v.content,
    metadata: v.metadata,
    valid_from: v.valid_from,
    valid_to: v.valid_to,
  }));
}

function pickPreferredProvision(existing: ProvisionSeed, incoming: ProvisionSeed): ProvisionSeed {
  const existingContent = normalizeWhitespace(existing.content);
  const incomingContent = normalizeWhitespace(incoming.content);

  if (incomingContent.length > existingContent.length) {
    return {
      ...incoming,
      title: incoming.title ?? existing.title,
    };
  }

  return {
    ...existing,
    title: existing.title ?? incoming.title,
  };
}

function dedupeProvisions(provisions: ProvisionSeed[]): { deduped: ProvisionSeed[]; stats: ProvisionDedupStats } {
  const byRef = new Map<string, ProvisionSeed>();
  const stats: ProvisionDedupStats = {
    duplicate_refs: 0,
    conflicting_duplicates: 0,
  };

  for (const provision of provisions) {
    const ref = provision.provision_ref.trim();
    const existing = byRef.get(ref);

    if (!existing) {
      byRef.set(ref, {
        ...provision,
        provision_ref: ref,
      });
      continue;
    }

    stats.duplicate_refs++;

    const existingContent = normalizeWhitespace(existing.content);
    const incomingContent = normalizeWhitespace(provision.content);

    if (existingContent !== incomingContent) {
      stats.conflicting_duplicates++;
    }

    byRef.set(ref, pickPreferredProvision(existing, provision));
  }

  return {
    deduped: Array.from(byRef.values()),
    stats,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build
// ─────────────────────────────────────────────────────────────────────────────

function buildDatabase(): void {
  console.log('Building Danish Legal Citation database...\n');

  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  db.exec(SCHEMA);

  // Prepared statements
  const insertDoc = db.prepare(`
    INSERT INTO legal_documents (id, type, title, title_en, short_name, status, issued_date, in_force_date, url, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProvision = db.prepare(`
    INSERT INTO legal_provisions (document_id, provision_ref, chapter, section, title, content, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertProvisionVersion = db.prepare(`
    INSERT INTO legal_provision_versions (
      document_id, provision_ref, chapter, section, title, content, metadata, valid_from, valid_to
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCaseLaw = db.prepare(`
    INSERT INTO case_law (document_id, court, case_number, decision_date, summary, keywords)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertPrepWork = db.prepare(`
    INSERT INTO preparatory_works (statute_id, prep_document_id, title, summary)
    VALUES (?, ?, ?, ?)
  `);

  const insertDefinition = db.prepare(`
    INSERT OR IGNORE INTO definitions (document_id, term, term_en, definition, source_provision)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertCrossRef = db.prepare(`
    INSERT INTO cross_references (source_document_id, source_provision_ref, target_document_id, target_provision_ref, ref_type)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertEUDocument = db.prepare(`
    INSERT INTO eu_documents (
      id, type, year, number, community, celex_number,
      title, title_sv, short_name, adoption_date, entry_into_force_date,
      in_force, amended_by, repeals, url_eur_lex, description
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEUReference = db.prepare(`
    INSERT INTO eu_references (
      source_type, source_id, document_id, provision_id,
      eu_document_id, eu_article, reference_type, reference_context,
      full_citation, is_primary_implementation, implementation_status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Load seed files
  if (!fs.existsSync(SEED_DIR)) {
    console.log(`No seed directory at ${SEED_DIR} — creating empty database.`);
    db.close();
    return;
  }

  const seedFiles = fs.readdirSync(SEED_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('.') && !f.startsWith('_') && f !== 'eu-references.json' && f !== 'eurlex-documents.json');

  if (seedFiles.length === 0) {
    console.log('No seed files found. Database created with empty schema.');
    db.close();
    return;
  }

  let totalDocs = 0;
  let totalProvisions = 0;
  let totalProvisionVersions = 0;
  let totalDefs = 0;
  let totalDuplicateRefs = 0;
  let totalConflictingDuplicates = 0;
  const pendingPrepWorks: PendingPrepWork[] = [];

  const loadAll = db.transaction(() => {
    for (const file of seedFiles) {
      const filePath = path.join(SEED_DIR, file);
      console.log(`  Loading ${file}...`);

      const content = fs.readFileSync(filePath, 'utf-8');
      const seed = JSON.parse(content) as DocumentSeed;

      insertDoc.run(
        seed.id, seed.type, seed.title, seed.title_en ?? null,
        seed.short_name ?? null, seed.status,
        seed.issued_date ?? null, seed.in_force_date ?? null,
        seed.url ?? null, seed.description ?? null
      );
      totalDocs++;

      const { deduped, stats } = dedupeProvisions(seed.provisions ?? []);
      totalDuplicateRefs += stats.duplicate_refs;
      totalConflictingDuplicates += stats.conflicting_duplicates;
      if (stats.duplicate_refs > 0) {
        console.log(
          `    WARNING: ${stats.duplicate_refs} duplicate refs in ${seed.id} ` +
          `(${stats.conflicting_duplicates} with different text).`
        );
      }

      const documentWindow = deriveDocumentValidityWindow(seed);
      const versionCandidates = seed.provision_versions ?? deduped;
      const { deduped: dedupedVersions } = dedupeProvisions(versionCandidates);
      const currentProvisions = deduped.length > 0
        ? deduped
        : selectLatestProvisionVersions(dedupedVersions);

      for (const prov of currentProvisions) {

        insertProvision.run(
          seed.id, prov.provision_ref, prov.chapter ?? null,
          prov.section, prov.title ?? null, prov.content,
          prov.metadata ? JSON.stringify(prov.metadata) : null
        );
        totalProvisions++;
      }

      for (const version of dedupedVersions) {
        insertProvisionVersion.run(
          seed.id,
          version.provision_ref,
          version.chapter ?? null,
          version.section,
          version.title ?? null,
          version.content,
          version.metadata ? JSON.stringify(version.metadata) : null,
          version.valid_from ?? documentWindow.validFrom,
          version.valid_to ?? documentWindow.validTo
        );
        totalProvisionVersions++;
      }

      for (const def of seed.definitions ?? []) {
        const result = insertDefinition.run(
          seed.id, def.term, def.term_en ?? null,
          def.definition, def.source_provision ?? null
        );
        totalDefs += result.changes;
      }

      if (seed.case_law) {
        insertCaseLaw.run(
          seed.id, seed.case_law.court,
          seed.case_law.case_number ?? null,
          seed.case_law.decision_date ?? null,
          seed.case_law.summary ?? null,
          seed.case_law.keywords ?? null
        );
      }

      for (const pw of seed.preparatory_works ?? []) {
        pendingPrepWorks.push({
          statute_id: seed.id,
          prep_document_id: pw.prep_document_id,
          title: pw.title,
          summary: pw.summary,
        });
      }

      console.log(
        `    ${currentProvisions.length} provisions, ${dedupedVersions.length} provision versions, ` +
        `${seed.definitions?.length ?? 0} definitions`
      );
    }

    // Create legal_documents entries for preparatory works before inserting them
    const prepDocIds = new Set<string>();
    const existingDocIds = new Set<string>(
      db.prepare('SELECT id FROM legal_documents').all().map((row: { id: string }) => row.id)
    );

    for (const pw of pendingPrepWorks) {
      if (!prepDocIds.has(pw.prep_document_id) && !existingDocIds.has(pw.prep_document_id)) {
        prepDocIds.add(pw.prep_document_id);

        // Determine document type from ID format
        let docType: 'bill' | 'sou' | 'ds';
        if (pw.prep_document_id.includes('/')) {
          docType = 'bill'; // Proposition format: 2017/18:105
        } else if (pw.title.toLowerCase().includes('sou')) {
          docType = 'sou'; // SOU format: 2017:39
        } else {
          docType = 'ds'; // Ds format: 2017:39
        }

        // Insert preparatory work as a legal document
        insertDoc.run(
          pw.prep_document_id,
          docType,
          pw.title,
          null, // title_en
          null, // short_name
          'in_force', // status
          null, // issued_date
          null, // in_force_date
          null, // url
          pw.summary ?? null // description
        );
      }
    }

    for (const pw of pendingPrepWorks) {
      insertPrepWork.run(pw.statute_id, pw.prep_document_id, pw.title, pw.summary ?? null);
    }

    // Load cross-references file if it exists
    const xrefPath = path.join(SEED_DIR, '_cross_references.json');
    if (fs.existsSync(xrefPath)) {
      const xrefs = JSON.parse(fs.readFileSync(xrefPath, 'utf-8')) as CrossRefSeed[];
      for (const xref of xrefs) {
        insertCrossRef.run(
          xref.source_document_id, xref.source_provision_ref ?? null,
          xref.target_document_id, xref.target_provision_ref ?? null,
          xref.ref_type
        );
      }
      console.log(`  Loaded ${xrefs.length} cross-references`);
    }

    // Load EU references file if it exists
    const euRefsPath = path.join(SEED_DIR, 'eu-references.json');
    if (fs.existsSync(euRefsPath)) {
      console.log('  Loading EU references...');
      const euData = JSON.parse(fs.readFileSync(euRefsPath, 'utf-8')) as EUSeedData;

      // Keep EU document sources explicit in seed files (country-specific mapping),
      // with optional enrichment from eurlex-documents.json.
      const commonEUDocs: EUDocumentSeed[] = [];
      const commonDocIds = new Set<string>();

      // Load EUR-Lex documents if available
      // EUR-Lex documents already have correct year/number values (no swapping needed)
      const eurlexDocIds = new Set<string>();
      let eurlexDocs: EUDocumentSeed[] = [];
      const eurlexPath = path.join(SEED_DIR, 'eurlex-documents.json');
      if (fs.existsSync(eurlexPath)) {
        console.log('  Loading EUR-Lex documents...');
        const eurlexData = JSON.parse(fs.readFileSync(eurlexPath, 'utf-8')) as any[];
        eurlexDocs = eurlexData.map(doc => {
          eurlexDocIds.add(doc.id);
          return {
            id: doc.id,
            type: doc.type,
            year: doc.year,
            number: doc.number,
            community: doc.community,
            celex_number: doc.celex_number,
            title: doc.title,
            title_sv: doc.title_sv,
            adoption_date: doc.date_document,
            in_force: doc.in_force,
            url_eur_lex: doc.url,
          };
        });
        console.log(`    Loaded ${eurlexDocs.length} EUR-Lex documents`);
      }

      const fixedSeedDocs = euData.eu_documents
        .filter(d => !commonDocIds.has(d.id) && !eurlexDocIds.has(d.id));

      const allEUDocs = [
        ...fixedSeedDocs,
        ...eurlexDocs,
      ];

      // Insert all EU documents
      for (const doc of allEUDocs) {
        // Validate year before inserting
        if (doc.year < 1957 || doc.year > 2100) {
          console.log(`    WARNING: Skipping ${doc.id} - invalid year ${doc.year}`);
          continue;
        }

        insertEUDocument.run(
          doc.id,
          doc.type,
          doc.year,
          doc.number,
          doc.community ?? null,
          doc.celex_number ?? null,
          doc.title ?? null,
          doc.title_sv ?? null,
          doc.short_name ?? null,
          doc.adoption_date ?? null,
          doc.entry_into_force_date ?? null,
          (doc.in_force ?? true) ? 1 : 0,
          doc.amended_by ?? null,
          doc.repeals ?? null,
          doc.url_eur_lex ?? null,
          doc.description ?? null
        );
      }

      console.log(`    Inserted ${allEUDocs.length} EU documents`);

      // Build provision_id lookup map for references
      const provisionIdMap = new Map<string, number>();
      const provisions = db.prepare(`
        SELECT id, document_id, provision_ref
        FROM legal_provisions
      `).all() as { id: number; document_id: string; provision_ref: string }[];

      for (const prov of provisions) {
        const key = `${prov.document_id}:${prov.provision_ref}`;
        provisionIdMap.set(key, prov.id);
      }

      // Insert EU references
      let insertedRefs = 0;
      let skippedRefs = 0;
      for (const ref of euData.eu_references) {
        // Resolve provision_id if this is a provision-level reference
        let provisionId: number | null = null;
        if (ref.source_type === 'provision' && ref.provision_ref) {
          const key = `${ref.document_id}:${ref.provision_ref}`;
          provisionId = provisionIdMap.get(key) ?? null;

          if (!provisionId) {
            console.log(`    WARNING: No provision found for ${key}`);
            skippedRefs++;
            continue;
          }
        }

        try {
          insertEUReference.run(
            ref.source_type,
            ref.source_id,
            ref.document_id,
            provisionId,
            ref.eu_document_id,
            ref.eu_article ?? null,
            ref.reference_type,
            ref.reference_context ?? null,
            ref.full_citation ?? null,
            (ref.is_primary_implementation ?? false) ? 1 : 0,
            ref.implementation_status ?? null
          );
          insertedRefs++;
        } catch (error) {
          console.log(`    ERROR inserting EU reference for ${ref.source_id} -> ${ref.eu_document_id}: ${error}`);
          skippedRefs++;
        }
      }

      console.log(`    Inserted ${insertedRefs} EU references (${skippedRefs} skipped)`);
    }
  });

  loadAll();

  // Write build metadata
  const insertMeta = db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)');
  const writeMeta = db.transaction(() => {
    insertMeta.run('tier', 'free');
    insertMeta.run('schema_version', '2');
    insertMeta.run('built_at', new Date().toISOString());
    insertMeta.run('builder', 'build-db.ts');
  });
  writeMeta();

  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('ANALYZE');
  db.close();

  const size = fs.statSync(DB_PATH).size;
  console.log(
    `\nBuild complete: ${totalDocs} documents, ${totalProvisions} provisions, ` +
    `${totalProvisionVersions} provision versions, ${totalDefs} definitions`
  );
  if (totalDuplicateRefs > 0) {
    console.log(
      `Data quality: ${totalDuplicateRefs} duplicate refs detected ` +
      `(${totalConflictingDuplicates} with conflicting text).`
    );
  }
  console.log(`Output: ${DB_PATH} (${(size / 1024).toFixed(1)} KB)`);
}

buildDatabase();
