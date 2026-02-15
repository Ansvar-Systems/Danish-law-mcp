-- EU References Schema for Swedish Law MCP
-- Tracks cross-references between Swedish law and EU directives/regulations

-- =============================================================================
-- EU Documents Table
-- =============================================================================
-- Stores metadata about EU directives and regulations referenced in Swedish law
CREATE TABLE IF NOT EXISTS eu_documents (
  id TEXT PRIMARY KEY,              -- Format: "directive:2016/679" or "regulation:2016/679"
  type TEXT NOT NULL,               -- "directive" or "regulation"
  year INTEGER NOT NULL,            -- Year of adoption (e.g., 2016)
  number INTEGER NOT NULL,          -- Sequential number (e.g., 679)
  community TEXT,                   -- "EU", "EG", "EEG", "Euratom"
  celex_number TEXT,                -- Official CELEX identifier (e.g., "32016L0680")
  title TEXT,                       -- English title
  title_sv TEXT,                    -- Swedish title
  short_name TEXT,                  -- Common abbreviation (e.g., "GDPR", "eIDAS")
  adoption_date TEXT,               -- ISO date of adoption
  entry_into_force_date TEXT,       -- ISO date when it entered into force
  in_force BOOLEAN DEFAULT 1,       -- Is this EU act currently in force?
  amended_by TEXT,                  -- JSON array of amending EU acts
  repeals TEXT,                     -- JSON array of repealed EU acts
  url_eur_lex TEXT,                 -- EUR-Lex URL
  description TEXT,                 -- Brief description
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CHECK (type IN ('directive', 'regulation')),
  CHECK (community IN ('EU', 'EG', 'EEG', 'Euratom')),
  CHECK (year >= 1957 AND year <= 2100),
  CHECK (number > 0)
);

-- Index for fast lookups by type and year
CREATE INDEX IF NOT EXISTS idx_eu_documents_type_year
ON eu_documents(type, year DESC);

-- Index for CELEX lookups
CREATE INDEX IF NOT EXISTS idx_eu_documents_celex
ON eu_documents(celex_number);

-- =============================================================================
-- EU References Table
-- =============================================================================
-- Links Swedish provisions to EU documents they reference
CREATE TABLE IF NOT EXISTS eu_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Swedish source
  source_type TEXT NOT NULL,        -- "provision", "document", "case_law"
  source_id TEXT NOT NULL,          -- provision.id or document.id
  document_id TEXT NOT NULL REFERENCES legal_documents(id), -- SFS number
  provision_id INTEGER REFERENCES legal_provisions(id),      -- Optional: specific provision

  -- EU target
  eu_document_id TEXT NOT NULL REFERENCES eu_documents(id),
  eu_article TEXT,                  -- Specific article reference (e.g., "6.1.c", "13-15", "83.4")

  -- Reference metadata
  reference_type TEXT NOT NULL,     -- Type of reference (see below)
  reference_context TEXT,           -- Surrounding text (for verification)
  full_citation TEXT,               -- Full citation as it appears in Swedish text

  -- Implementation tracking
  is_primary_implementation BOOLEAN DEFAULT 0,  -- Is this the main implementing statute?
  implementation_status TEXT,       -- "complete", "partial", "pending", "unknown"

  -- Metadata
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_verified TEXT,               -- Last time reference was verified to be current

  -- Constraints
  CHECK (source_type IN ('provision', 'document', 'case_law')),
  CHECK (reference_type IN (
    'implements',          -- Swedish law implements this EU directive
    'supplements',         -- Swedish law supplements this EU regulation
    'applies',             -- This EU regulation applies directly
    'references',          -- General reference to EU law
    'complies_with',       -- Swedish law must comply with this
    'derogates_from',      -- Swedish law derogates from this (allowed by EU law)
    'amended_by',          -- Swedish law was amended to implement this
    'repealed_by',         -- Swedish law was repealed by this EU act
    'cites_article'        -- Cites specific article(s) of EU act
  )),
  CHECK (implementation_status IN ('complete', 'partial', 'pending', 'unknown')),

  -- Ensure no duplicate references
  UNIQUE(source_id, eu_document_id, eu_article)
);

-- Index for Swedish document → EU lookups
CREATE INDEX IF NOT EXISTS idx_eu_references_document
ON eu_references(document_id, eu_document_id);

-- Index for EU document → Swedish implementations lookups
CREATE INDEX IF NOT EXISTS idx_eu_references_eu_document
ON eu_references(eu_document_id, document_id);

-- Index for provision-level references
CREATE INDEX IF NOT EXISTS idx_eu_references_provision
ON eu_references(provision_id, eu_document_id);

-- Index for finding primary implementations
CREATE INDEX IF NOT EXISTS idx_eu_references_primary
ON eu_references(eu_document_id, is_primary_implementation)
WHERE is_primary_implementation = 1;

-- =============================================================================
-- EU Reference Keywords Table
-- =============================================================================
-- Tracks implementation keywords found in Swedish law (for analysis)
CREATE TABLE IF NOT EXISTS eu_reference_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eu_reference_id INTEGER NOT NULL REFERENCES eu_references(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,            -- "genomförande", "komplettering", etc.
  position INTEGER,                 -- Position in text where keyword appears

  UNIQUE(eu_reference_id, keyword)
);

-- =============================================================================
-- Views for Common Queries
-- =============================================================================

-- View: Swedish statutes implementing each EU directive
CREATE VIEW IF NOT EXISTS v_eu_implementations AS
SELECT
  ed.id AS eu_document_id,
  ed.type,
  ed.year,
  ed.number,
  ed.title,
  ed.short_name,
  ld.id AS sfs_number,
  ld.title AS swedish_title,
  ld.short_name AS swedish_short_name,
  er.reference_type,
  er.is_primary_implementation,
  er.implementation_status
FROM eu_documents ed
JOIN eu_references er ON ed.id = er.eu_document_id
JOIN legal_documents ld ON er.document_id = ld.id
WHERE ed.type = 'directive'
ORDER BY ed.year DESC, ed.number, ld.id;

-- View: EU regulations applied in Swedish law
CREATE VIEW IF NOT EXISTS v_eu_regulations_applied AS
SELECT
  ed.id AS eu_document_id,
  ed.year,
  ed.number,
  ed.title,
  ed.short_name,
  COUNT(DISTINCT er.document_id) AS swedish_statute_count,
  COUNT(er.id) AS total_references
FROM eu_documents ed
JOIN eu_references er ON ed.id = er.eu_document_id
WHERE ed.type = 'regulation'
GROUP BY ed.id
ORDER BY total_references DESC;

-- View: Swedish statutes with most EU references
CREATE VIEW IF NOT EXISTS v_statutes_by_eu_references AS
SELECT
  ld.id AS sfs_number,
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

-- View: GDPR implementations in Swedish law
CREATE VIEW IF NOT EXISTS v_gdpr_implementations AS
SELECT
  ld.id AS sfs_number,
  ld.title,
  lp.provision_ref,
  lp.content,
  er.eu_article,
  er.reference_type
FROM eu_documents ed
JOIN eu_references er ON ed.id = er.eu_document_id
JOIN legal_documents ld ON er.document_id = ld.id
LEFT JOIN legal_provisions lp ON er.provision_id = lp.id
WHERE ed.id = 'regulation:2016/679'  -- GDPR
ORDER BY ld.id, lp.provision_ref;

-- =============================================================================
-- Seed Data for Common EU Acts
-- =============================================================================

-- Insert GDPR (most referenced regulation)
INSERT OR IGNORE INTO eu_documents (
  id, type, year, number, community, celex_number,
  title, title_sv, short_name, adoption_date, entry_into_force_date,
  in_force, url_eur_lex, description
) VALUES (
  'regulation:2016/679',
  'regulation',
  2016,
  679,
  'EU',
  '32016R0679',
  'Regulation (EU) 2016/679 on the protection of natural persons with regard to the processing of personal data and on the free movement of such data',
  'Europaparlamentets och rådets förordning (EU) 2016/679 om skydd för fysiska personer med avseende på behandling av personuppgifter',
  'GDPR',
  '2016-04-27',
  '2018-05-25',
  1,
  'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
  'General Data Protection Regulation - comprehensive data protection law for the EU'
);

-- Insert Data Protection Directive (repealed by GDPR but still referenced)
INSERT OR IGNORE INTO eu_documents (
  id, type, year, number, community, celex_number,
  title, title_sv, short_name, adoption_date, entry_into_force_date,
  in_force, url_eur_lex, description, amended_by
) VALUES (
  'directive:95/46',
  'directive',
  1995,
  46,
  'EG',
  '31995L0046',
  'Directive 95/46/EC on the protection of individuals with regard to the processing of personal data',
  'Direktiv 95/46/EG om skydd för enskilda vid behandling av personuppgifter',
  'Data Protection Directive',
  '1995-10-24',
  '1995-10-24',
  0,  -- Repealed
  'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:31995L0046',
  'Repealed by GDPR on 2018-05-25',
  '["regulation:2016/679"]'
);

-- Insert eIDAS Regulation
INSERT OR IGNORE INTO eu_documents (
  id, type, year, number, community, celex_number,
  title, title_sv, short_name, adoption_date, entry_into_force_date,
  in_force, url_eur_lex, description
) VALUES (
  'regulation:910/2014',
  'regulation',
  2014,
  910,
  'EU',
  '32014R0910',
  'Regulation (EU) No 910/2014 on electronic identification and trust services for electronic transactions',
  'Europaparlamentets och rådets förordning (EU) nr 910/2014 om elektronisk identifiering och betrodda tjänster',
  'eIDAS',
  '2014-07-23',
  '2016-07-01',
  1,
  'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014R0910',
  'Electronic identification and trust services regulation'
);

-- =============================================================================
-- Triggers for Data Integrity
-- =============================================================================

-- Trigger: Update last_verified timestamp when reference is modified
CREATE TRIGGER IF NOT EXISTS update_eu_reference_verified
AFTER UPDATE ON eu_references
BEGIN
  UPDATE eu_references
  SET last_verified = CURRENT_TIMESTAMP
  WHERE id = NEW.id;
END;

-- Trigger: Cascade delete keywords when reference is deleted
-- (Already handled by ON DELETE CASCADE in eu_reference_keywords)

-- =============================================================================
-- Queries for MCP Tool Implementation
-- =============================================================================

-- Query 1: Get EU basis for a Swedish statute
-- Usage: get_eu_basis(sfs_number)
/*
SELECT
  ed.id,
  ed.type,
  ed.year,
  ed.number,
  ed.community,
  ed.title,
  ed.short_name,
  er.reference_type,
  er.eu_article,
  er.is_primary_implementation
FROM eu_documents ed
JOIN eu_references er ON ed.id = er.eu_document_id
WHERE er.document_id = ?
ORDER BY
  CASE er.reference_type
    WHEN 'implements' THEN 1
    WHEN 'supplements' THEN 2
    WHEN 'applies' THEN 3
    ELSE 4
  END,
  ed.year DESC;
*/

-- Query 2: Get Swedish implementations of an EU directive
-- Usage: get_swedish_implementations(eu_directive_id)
/*
SELECT
  ld.id AS sfs_number,
  ld.title,
  ld.short_name,
  ld.status,
  er.reference_type,
  er.is_primary_implementation,
  er.implementation_status
FROM legal_documents ld
JOIN eu_references er ON ld.id = er.document_id
WHERE er.eu_document_id = ?
ORDER BY er.is_primary_implementation DESC, ld.id;
*/

-- Query 3: Get provision-level EU references
-- Usage: get_provision_eu_basis(sfs_number, provision_ref)
/*
SELECT
  ed.id,
  ed.type,
  ed.title,
  ed.short_name,
  er.eu_article,
  er.reference_type,
  er.full_citation
FROM eu_documents ed
JOIN eu_references er ON ed.id = er.eu_document_id
JOIN legal_provisions lp ON er.provision_id = lp.id
WHERE lp.document_id = ? AND lp.provision_ref = ?;
*/
