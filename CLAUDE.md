# CLAUDE.md

> Instructions for Claude Code when working on Swedish Law MCP

## Project Overview

This is an MCP server providing Swedish legal citation tools — searching statutes, case law, preparatory works, and validating citations. Built with TypeScript and SQLite FTS5 for full-text search.

**Core principle: Verified data only** — the server NEVER generates citations, only returns data verified against authoritative Swedish legal sources (Riksdagen, lagen.nu). All database entries are validated during ingestion.

**Data Sources:**
- Riksdagen (Swedish Parliament) legal database
- Svensk Forfattningssamling (SFS) - Swedish Code of Statutes
- EUR-Lex - Official EU legislation database (metadata)

## Architecture

```
src/
├── index.ts                 # MCP server entry point (stdio transport)
├── types/
│   ├── index.ts             # Re-exports all types
│   ├── documents.ts         # LegalDocument, DocumentType, DocumentStatus
│   ├── provisions.ts        # LegalProvision, ProvisionRef, CrossReference
│   └── citations.ts         # ParsedCitation, CitationFormat, ValidationResult
├── citation/
│   ├── parser.ts            # Parse citation strings (SFS, Prop., SOU, NJA, etc.)
│   ├── formatter.ts         # Format citations per Swedish conventions
│   └── validator.ts         # Validate citations against database
├── parsers/
│   ├── provision-parser.ts  # Parse raw statute text into provisions
│   └── cross-ref-extractor.ts  # Extract cross-references from text
└── tools/
    ├── search-legislation.ts    # search_legislation - FTS5 provision search
    ├── get-provision.ts         # get_provision - Retrieve specific provision
    ├── search-case-law.ts       # search_case_law - FTS5 case law search
    ├── get-preparatory-works.ts # get_preparatory_works - Linked forarbeten
    ├── validate-citation.ts     # validate_citation - Zero-hallucination check
    ├── build-legal-stance.ts    # build_legal_stance - Multi-source aggregation
    ├── format-citation.ts       # format_citation - Citation formatting
    ├── check-currency.ts        # check_currency - Is statute in force?
    ├── get-eu-basis.ts          # get_eu_basis - EU law for Swedish statute
    ├── get-swedish-implementations.ts # get_swedish_implementations - Swedish laws for EU act
    ├── search-eu-implementations.ts   # search_eu_implementations - Search EU documents
    ├── get-provision-eu-basis.ts      # get_provision_eu_basis - EU basis for provision
    └── validate-eu-compliance.ts      # validate_eu_compliance - Future feature

scripts/
├── build-db.ts              # Build SQLite database from seed files
├── ingest-riksdagen.ts      # Ingest statutes from Riksdagen API
└── check-updates.ts         # Check for statute amendments

tests/
├── fixtures/test-db.ts      # In-memory SQLite with Swedish law sample data
├── citation/                # Parser, formatter, validator tests
├── parsers/                 # Provision parser tests
└── tools/                   # Tool-level integration tests

data/
├── seed/                    # JSON seed files per document
└── database.db              # SQLite database
```

## MCP Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 search on provision text with BM25 ranking |
| `get_provision` | Retrieve specific provision by SFS + chapter/section |
| `search_case_law` | FTS5 search on case law with court/date filters |
| `get_preparatory_works` | Get linked propositions and SOUs for a statute |
| `validate_citation` | Validate citation against database (verification check) |
| `build_legal_stance` | Aggregate citations from statutes, case law, prep works |
| `format_citation` | Format citations (full/short/pinpoint) |
| `check_currency` | Check if statute is in force, amended, or repealed |

### EU Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get EU directives/regulations for Swedish statute |
| `get_swedish_implementations` | Find Swedish laws implementing EU act |
| `search_eu_implementations` | Search EU documents with Swedish implementation counts |
| `get_provision_eu_basis` | Get EU law references for specific provision |
| `validate_eu_compliance` | Check implementation status (future, requires EU MCP) |

## Swedish Law Structure

Swedish statutes follow this structure:
- **SFS number**: e.g., "2018:218" (year:sequence)
- **Chapters** (Kapitel): Major divisions, e.g., "3 kap."
- **Sections** (Paragrafer): Individual provisions, marked with §
- **Paragraphs** (Stycken): Within sections

Citation formats:
- Full: `SFS 2018:218 3 kap. 5 §`
- Short: `2018:218 3:5`
- Pinpoint: `3 kap. 5 §`
- Proposition: `Prop. 2017/18:105`
- SOU: `SOU 2017:39`
- Case law: `NJA 2020 s. 45`, `HFD 2019 ref. 12`

## Key Commands

```bash
# Development
npm run dev              # Run server with hot reload
npm run build            # Compile TypeScript
npm test                 # Run tests (vitest)

# Data Management
npm run ingest -- <sfs-number> <output.json>  # Ingest statute from Riksdagen
npm run build:db                               # Rebuild database from seed/
npm run check-updates                          # Check for amendments

# Testing
npx @anthropic/mcp-inspector node dist/index.js
```

## Database Schema

```sql
-- All legal documents (statutes, bills, SOUs, case law)
CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,          -- SFS number or doc ID
  type TEXT NOT NULL,           -- statute|bill|sou|ds|case_law
  title TEXT NOT NULL,
  title_en TEXT,
  short_name TEXT,              -- e.g., "DSL", "BrB"
  status TEXT NOT NULL,         -- in_force|amended|repealed|not_yet_in_force
  issued_date TEXT,
  in_force_date TEXT,
  url TEXT,
  description TEXT,
  last_updated TEXT
);

-- Individual provisions from statutes
CREATE TABLE legal_provisions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,  -- e.g., "3:5" or "5 a"
  chapter TEXT,
  section TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,                -- JSON
  UNIQUE(document_id, provision_ref)
);

-- EU directives and regulations (v1.1.0)
CREATE TABLE eu_documents (
  id TEXT PRIMARY KEY,          -- "directive:2016/679" or "regulation:2016/679"
  type TEXT NOT NULL,           -- "directive" | "regulation"
  year INTEGER NOT NULL,
  number INTEGER NOT NULL,
  community TEXT,               -- "EU" | "EG" | "EEG" | "Euratom"
  celex_number TEXT,            -- "32016R0679" (EUR-Lex standard)
  title TEXT,
  title_en TEXT,
  short_name TEXT,              -- "GDPR", "eIDAS", etc.
  in_force BOOLEAN DEFAULT 1,
  adoption_date TEXT,
  url TEXT,                     -- EUR-Lex URL
  UNIQUE(type, year, number)
);

-- Swedish → EU cross-references (v1.1.0)
CREATE TABLE eu_references (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),  -- Swedish SFS number
  provision_id INTEGER REFERENCES legal_provisions(id),      -- Optional provision link
  eu_document_id TEXT NOT NULL REFERENCES eu_documents(id),  -- EU directive/regulation
  eu_article TEXT,              -- "6.1.c", "13-15", etc.
  reference_type TEXT,          -- "implements", "supplements", "applies", etc.
  is_primary_implementation BOOLEAN DEFAULT 0,
  context TEXT,                 -- Surrounding Swedish text
  UNIQUE(document_id, provision_id, eu_document_id, eu_article)
);

-- EU reference keywords for classification (v1.1.0)
CREATE TABLE eu_reference_keywords (
  keyword TEXT PRIMARY KEY,     -- "genomförande", "kompletterar", etc.
  reference_type TEXT NOT NULL  -- Maps to eu_references.reference_type
);

-- FTS5 indexes (content-synced with triggers)
CREATE VIRTUAL TABLE provisions_fts USING fts5(...);
CREATE VIRTUAL TABLE case_law_fts USING fts5(...);
CREATE VIRTUAL TABLE prep_works_fts USING fts5(...);
CREATE VIRTUAL TABLE definitions_fts USING fts5(...);

-- Case law, preparatory works, cross-references, definitions
-- See scripts/build-db.ts for full schema
```

## EU Integration Architecture (v1.1.0)

### Bi-Directional Reference Model

```
Swedish Statute ←→ EU Directive/Regulation
       ↓                      ↓
  Provisions          EU Articles
       ↓                      ↓
    Case Law              CJEU (future)
```

### Data Flow

1. **Ingestion:** EU references extracted from Swedish statute text via `src/parsers/eu-reference-parser.ts`
2. **Storage:** Stored in `eu_documents` and `eu_references` tables
3. **Lookup:** Bi-directional queries via MCP tools
4. **Validation:** CELEX numbers validated against EUR-Lex format

### Example Queries

**Swedish → EU:**
```sql
-- Find EU basis for DSL
SELECT ed.id, ed.short_name, er.reference_type
FROM eu_references er
JOIN eu_documents ed ON er.eu_document_id = ed.id
WHERE er.document_id = '2018:218';
```

**EU → Swedish:**
```sql
-- Find Swedish implementations of GDPR
SELECT ld.id, ld.title, er.is_primary_implementation
FROM eu_references er
JOIN legal_documents ld ON er.document_id = ld.id
WHERE er.eu_document_id = 'regulation:2016/679';
```

**Provision-level:**
```sql
-- EU basis for DSL 3:5
SELECT ed.id, ed.short_name, er.eu_article
FROM eu_references er
JOIN eu_documents ed ON er.eu_document_id = ed.id
JOIN legal_provisions lp ON er.provision_id = lp.id
WHERE lp.document_id = '2018:218' AND lp.provision_ref = '3:5';
```

## Testing

Tests use in-memory SQLite with sample Swedish law data:

```typescript
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('search_legislation', () => {
  let db: Database;
  beforeAll(() => { db = createTestDatabase(); });
  afterAll(() => { closeTestDatabase(db); });

  it('should find dataskydd provisions', async () => {
    const result = await searchLegislation(db, { query: 'personuppgifter' });
    expect(result.length).toBeGreaterThan(0);
  });
});
```

Sample data includes: DSL (2018:218), PUL (1998:204), 2 court decisions, 2 preparatory works, definitions, and cross-references.

## Database Statistics (v1.1.0)

- **Statutes:** 750 laws (823% growth from v1.0.0)
- **Provisions:** 31,641 sections
- **Preparatory Works:** 3,625 documents
- **EU Cross-References:** 668 references to 228 EU documents
- **Legal Definitions:** 1,210 terms
- **Database Size:** 65.6 MB
- **MCP Tools:** 13 (8 core + 5 EU integration)

## EU Law Integration

The MCP server includes comprehensive cross-referencing between Swedish law and EU directives/regulations.

**Data Source:**
- **Provider:** [EUR-Lex](https://eur-lex.europa.eu/)
- **License:** EU public domain
- **Coverage:** 668 cross-references, 228 EU documents (89 directives, 139 regulations)
- **Swedish Statutes:** 49 statutes (68% of database) have EU references
- **Granularity:** Provision-level references to specific EU articles

**EU Integration Features:**
- **Bi-directional Lookup:** Find EU basis for Swedish law AND Swedish implementations of EU law
- **5 Specialized Tools:** `get_eu_basis`, `get_swedish_implementations`, `search_eu_implementations`, `get_provision_eu_basis`, `validate_eu_compliance`
- **CELEX Numbers:** Official EU document identifiers for all documents
- **EUR-Lex Metadata:** 47 documents fetched directly from EUR-Lex API
- **Implementation Tracking:** Primary vs supplementary implementation metadata
- **Zero-Hallucination:** All references extracted from verified statute text

**EU Ingestion Commands:**
```bash
# Fetch missing EU documents from EUR-Lex
npm run fetch:eurlex -- --missing

# Fetch single EU document
npm run fetch:eurlex -- regulation:2016/679

# Import EUR-Lex documents into database
npm run import:eurlex-documents

# Migrate EU references from seed files
npm run migrate:eu-references

# Verify EU coverage
npm run verify:eu-coverage
```

**Data Quality:**
- Zero-hallucination constraint applies to EU data
- All EU references extracted from verified Swedish statute text
- EUR-Lex metadata validated with CELEX number verification
- 97.95% reference coverage (668/682 seed references)
- FTS5 full-text search on EU document metadata

## Ingestion from Riksdagen

API endpoints:
- Document list: `https://data.riksdagen.se/dokumentlista/?doktyp=sfs&format=json`
- Document content: `https://data.riksdagen.se/dokument/{id}.json`

Rate limit: 0.5s between requests.

## Resources

- [Riksdagen Open Data](https://data.riksdagen.se/)
- [Svensk Forfattningssamling](https://svenskforfattningssamling.se/)
- [Lagrummet](https://lagrummet.se/) - Legal information system
- [Lagen.nu](https://lagen.nu) - Case law and legal information (CC-BY Domstolsverket)
