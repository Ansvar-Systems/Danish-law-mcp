# CLAUDE.md

> Instructions for Claude Code when working on Danish Law MCP

## Project Overview

This is an MCP server providing Danish legal citation tools — searching statutes, case law, preparatory works, and validating citations. Built with TypeScript and SQLite FTS5 for full-text search.

**Core principle: Verified data only** — the server NEVER generates citations, only returns data verified against authoritative Danish legal sources (Retsinformation, Lovtidende). All database entries are validated during ingestion.

**Data Sources:**
- Retsinformation (Official Danish legal information system)
- Lovtidende (Danish Official Gazette)
- EUR-Lex - Official EU legislation database (metadata)

## Architecture

```
src/
├── index.ts                 # MCP server entry point (stdio transport)
├── types/
│   ├── index.ts             # Re-exports all types
│   ├── documents.ts         # LegalDocument, DocumentType, DocumentStatus
│   ├── provisions.ts        # LegalProvision, ProvisionRef, CrossReference
│   ├── citations.ts         # ParsedCitation, CitationFormat, ValidationResult
│   └── eu-references.ts     # EUDocument, EUReference, DanishImplementation
├── citation/
│   ├── parser.ts            # Parse citation strings
│   ├── formatter.ts         # Format citations per Danish conventions
│   └── validator.ts         # Validate citations against database
├── parsers/
│   ├── provision-parser.ts  # Parse raw statute text into provisions
│   ├── cross-ref-extractor.ts  # Extract cross-references from text
│   └── eu-reference-parser.ts  # Extract EU references from statute text
└── tools/
    ├── search-legislation.ts    # search_legislation - FTS5 provision search
    ├── get-provision.ts         # get_provision - Retrieve specific provision
    ├── search-case-law.ts       # search_case_law - FTS5 case law search
    ├── get-preparatory-works.ts # get_preparatory_works - Linked forarbejder
    ├── validate-citation.ts     # validate_citation - Zero-hallucination check
    ├── build-legal-stance.ts    # build_legal_stance - Multi-source aggregation
    ├── format-citation.ts       # format_citation - Citation formatting
    ├── check-currency.ts        # check_currency - Is statute in force?
    ├── get-eu-basis.ts          # get_eu_basis - EU law for Danish statute
    ├── get-danish-implementations.ts # get_danish_implementations - Danish laws for EU act
    ├── search-eu-implementations.ts   # search_eu_implementations - Search EU documents
    ├── get-provision-eu-basis.ts      # get_provision_eu_basis - EU basis for provision
    ├── validate-eu-compliance.ts      # validate_eu_compliance - Compliance check
    ├── about.ts                 # about - Server metadata and provenance
    └── registry.ts              # Tool registry (shared between entry points)

scripts/
├── build-db.ts              # Build SQLite database from seed files
├── ingest-retsinformation.ts # Ingest statutes from Retsinformation
└── check-updates.ts         # Check for statute amendments

tests/
├── fixtures/test-db.ts      # In-memory SQLite with Danish law sample data
├── citation/                # Parser, formatter, validator tests
├── parsers/                 # Provision parser tests
└── tools/                   # Tool-level integration tests

data/
├── seed/                    # JSON seed files per document
└── database.db              # SQLite database
```

## MCP Tools (15)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 search on provision text with BM25 ranking |
| `get_provision` | Retrieve specific provision by document ID + chapter/section |
| `search_case_law` | FTS5 search on case law (retspraksis) with court/date filters |
| `get_preparatory_works` | Get linked preparatory works (forarbejder) for a statute |
| `validate_citation` | Validate citation against database (verification check) |
| `build_legal_stance` | Aggregate citations from statutes, case law, prep works |
| `format_citation` | Format citations (full/short/pinpoint) |
| `check_currency` | Check if statute is in force, amended, or repealed |

### EU Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get EU directives/regulations for Danish statute |
| `get_danish_implementations` | Find Danish laws implementing EU act |
| `search_eu_implementations` | Search EU documents with Danish implementation counts |
| `get_provision_eu_basis` | Get EU law references for specific provision |
| `validate_eu_compliance` | Check implementation status |

### Metadata Tools (2)

| Tool | Description |
|------|-------------|
| `about` | Server metadata, dataset statistics, and provenance |
| `list_sources` | List all data sources with URLs, licenses, and coverage |

## Danish Law Structure

Danish statutes follow this structure:
- **Document ID**: e.g., "2018:502" (year:sequence, from Retsinformation)
- **Chapters** (Kapitel): Major divisions, e.g., "Kapitel 3"
- **Sections** (Paragraffer): Individual provisions, marked with §
- **Subsections** (Stykker): Within sections, marked "Stk."

Key legal document types:
- **Lov**: Parliamentary act (statute)
- **Bekendtgørelse**: Executive order
- **Grundloven**: The Danish Constitution (LOV nr 169 af 05/06/1953)

## Key Commands

```bash
# Development
npm run dev              # Run server with hot reload
npm run build            # Compile TypeScript
npm test                 # Run tests (vitest)

# Data Management
npm run ingest -- <document-id> <output.json>  # Ingest statute from Retsinformation
npm run build:db                               # Rebuild database from seed/
npm run check-updates                          # Check for amendments

# EU Integration
npm run fetch:eurlex                           # Fetch EU documents from EUR-Lex
npm run import:eurlex-documents                # Import EUR-Lex into database
npm run migrate:eu-references                  # Migrate EU references from seeds
npm run verify:eu-coverage                     # Verify EU coverage

# Testing
npx @anthropic/mcp-inspector node dist/index.js
```

## Database Schema

```sql
-- All legal documents (statutes, bills, case law)
CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,          -- Document ID from Retsinformation
  type TEXT NOT NULL,           -- statute|bill|case_law|...
  title TEXT NOT NULL,
  title_en TEXT,
  short_name TEXT,              -- e.g., "DSL", "Grundloven"
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

-- EU directives and regulations
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

-- Danish → EU cross-references
CREATE TABLE eu_references (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_id INTEGER REFERENCES legal_provisions(id),
  eu_document_id TEXT NOT NULL REFERENCES eu_documents(id),
  eu_article TEXT,
  reference_type TEXT,          -- "implements", "supplements", "applies", etc.
  is_primary_implementation BOOLEAN DEFAULT 0,
  context TEXT,
  UNIQUE(document_id, provision_id, eu_document_id, eu_article)
);

-- FTS5 indexes (content-synced with triggers)
CREATE VIRTUAL TABLE provisions_fts USING fts5(...);
CREATE VIRTUAL TABLE case_law_fts USING fts5(...);
CREATE VIRTUAL TABLE prep_works_fts USING fts5(...);
CREATE VIRTUAL TABLE definitions_fts USING fts5(...);

-- Case law, preparatory works, cross-references, definitions
-- See scripts/build-db.ts for full schema
```

## Database Statistics

- **Legal Documents:** ~62,700
- **Provisions:** ~620,900 sections
- **Definitions:** ~8,200 terms
- **EU Documents:** Cross-referenced
- **Database Size:** ~1.7 GB
- **MCP Tools:** 15 (8 core + 5 EU integration + 2 metadata)

## Testing

Tests use in-memory SQLite with sample Danish law data:

```typescript
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('search_legislation', () => {
  let db: Database;
  beforeAll(() => { db = createTestDatabase(); });
  afterAll(() => { closeTestDatabase(db); });

  it('should find databeskyttelse provisions', async () => {
    const result = await searchLegislation(db, { query: 'personoplysninger' });
    expect(result.length).toBeGreaterThan(0);
  });
});
```

## Ingestion from Retsinformation

API endpoints:
- Update feed: `https://api.retsinformation.dk/api/document/updated`
- Document XML: `https://www.retsinformation.dk/eli/lta/{year}/{number}`

## Resources

- [Retsinformation](https://www.retsinformation.dk/) - Official Danish legal information system
- [Retsinformation API](https://api.retsinformation.dk/) - Programmatic access
- [Lovtidende](https://www.lovtidende.dk/) - Danish Official Gazette
- [EUR-Lex](https://eur-lex.europa.eu/) - EU legislation database

## Git Workflow

- **Never commit directly to `main`.** Always create a feature branch and open a Pull Request.
- Branch protection requires: verified signatures, PR review, and status checks to pass.
- Use conventional commit prefixes: `feat:`, `fix:`, `chore:`, `docs:`, etc.
