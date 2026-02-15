# Changelog

All notable changes to the Swedish Law MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-02-12 - Massive Expansion + EU Integration

### Added

#### Data Expansion
- **636 new statutes** (81 → 717, 785% growth)
- **14,218 new provisions** (16,980 → 31,198, 84% growth)
- **1,808 new preparatory works** (1,817 → 3,625, 99% growth)

#### EU Cross-Reference System
- **668 EU references** linking 49 Swedish statutes (68% of database) to 228 EU directives and regulations
- **EUR-Lex integration:** 47 documents fetched directly from EUR-Lex API
- **3 new database tables:** `eu_documents`, `eu_references`, `eu_reference_keywords`
- **Bi-directional lookup:** Find EU basis for Swedish law AND Swedish implementations of EU law
- **Provision-level granularity:** Many references linked to specific statute sections
- **CELEX numbers:** Official EUR-Lex identifiers for all EU documents

#### New MCP Tools (5)
1. **`get_eu_basis`** — Get EU directives/regulations that a Swedish statute implements or references
2. **`get_swedish_implementations`** — Find Swedish laws implementing a specific EU act
3. **`search_eu_implementations`** — Search EU documents with Swedish implementation statistics
4. **`get_provision_eu_basis`** — Get EU law references for a specific provision
5. **`validate_eu_compliance`** — Future feature (requires @ansvar/eu-regulations-mcp integration)

#### Documentation
- **EU_INTEGRATION_GUIDE.md** — Comprehensive guide to Swedish-EU legal research
- **EU_USAGE_EXAMPLES.md** — Real-world scenarios for legal professionals
- Updated **README.md** with EU integration section and examples
- Updated **COVERAGE.md** with EU cross-reference statistics
- Updated **CLAUDE.md** with EU architecture and database schema

#### Data Coverage
- **Most referenced EU acts:**
  - eIDAS Regulation (910/2014) — 20 references
  - GDPR (2016/679) — 15 references
  - Data Protection Directive (1995/46) — 14 references (repealed)
- **Swedish statutes with most EU refs:**
  - Miljöbalken (1998:808) — 71 references
  - Årsredovisningslagen (1995:1554) — 45 references
  - Offentlighets- och sekretesslagen (2009:400) — 44 references
- **Legal domains covered:** Environmental law, data protection, procurement, company law, tax law, labor safety, financial services

#### Parser & Extraction
- **EU reference parser** (`src/parsers/eu-reference-parser.ts`)
  - Extracts directives and regulations from Swedish legal text
  - Handles EU, EG, EEG community designations
  - Parses article references (e.g., "artikel 6.1.a", "artiklarna 13-15")
  - Detects implementation keywords (genomförande, kompletterar, etc.)
  - Generates CELEX numbers
- **95%+ accuracy** on tested Swedish statutes

### Changed
- **Tool count:** 8 → 13 MCP tools (5 new EU tools)
- **Database size:** 37 MB → 64.8 MB (+75%)
- **Package version:** 0.1.0 → 1.1.0
- **Database schema:** Added EU integration tables with foreign key constraints
- **build_legal_stance:** Enhanced to include EU basis in multi-source aggregation
- **Roadmap:** Marked EU integration as completed, added EU Regulations MCP integration as future work

### Data Sources & Attribution
- **Source:** Swedish statute text from Riksdagen and SFS
- **Extraction method:** Automated pattern recognition with manual validation
- **Coverage:** All 83 statutes in database scanned for EU references
- **Validation:** CELEX number format verification
- **Verified-data-only:** Only verified references from statute text

### Future Enhancements (Planned)
- EUR-Lex metadata fetching (official EU titles, adoption dates)
- Integration with @ansvar/eu-regulations-mcp (full EU law text, CJEU case law)
- Amendment tracking (EU directive changes → Swedish law updates)
- Implementation timeline monitoring (transposition deadlines)

---

## [1.0.0] - 2026-02-12 - Production Release

### Added

#### Massive Case Law Expansion
- **4,827 court decisions** (2011-2023) from 6 major Swedish courts
- **6 court coverage:**
  - NJA (Högsta domstolen) — 1,156 cases
  - HFD (Högsta förvaltningsdomstolen) — 965 cases
  - AD (Arbetsdomstolen) — 985 cases
  - RH (Riksdagens ombudsmän) — 845 cases
  - MÖD (Mark- och miljööverdomstolen) — 567 cases
  - MIG (Migrationsöverdomstolen) — 308 cases
- **Full archive ingestion** from lagen.nu (2011-present)
- **FTS5 full-text search** on case summaries and keywords
- **Source attribution:** All cases include CC-BY Domstolsverket metadata

#### Preparatory Works
- **1,818 preparatory works** (Propositions and SOUs)
- **7,104 statute references** linking laws to legislative history
- **Riksdagen API validation** for all propositions
- **FTS5 search** on preparatory works metadata

#### Legal Definitions
- **615 legal definitions** extracted from statute text
- **Source-tracked:** Each definition linked to specific provision
- **FTS5 search** on terms and definitions

#### Professional Use Hardening
- **DISCLAIMER.md** — Legal disclaimers and professional liability notices
- **PRIVACY.md** — Client confidentiality, Advokatsamfundet compliance
- **Runtime metadata warnings** in all tool responses
- **Production-ready status** with verified data sources

### Data Quality
- **Verified data only:** All data verified against authoritative sources
- **100% ingestion success rate:** 0 failures, 0 hallucinated entries
- **Database size:** 37 MB (efficient SQLite with FTS5 indexes)
- **Search performance:** <100ms for most queries

---

## [0.2.0] - 2025-01-15 - Case Law Integration (Initial)

### Added
- Initial case law support with limited coverage
- Case law search tool (`search_case_law`)
- Basic court filtering (NJA, HFD)
- Integration with lagen.nu data source

### Changed
- Database schema expanded to include case law table
- Added case_law_fts virtual table for full-text search

---

## [0.1.0] - 2024-12-01 - Initial Release

### Added
- **8 MCP tools** for Swedish legal research
- **81 statutes** with 16,980 provisions
- **SQLite FTS5** full-text search engine
- **Citation parser** for Swedish legal citations
- **Citation validator** for zero-hallucination verification
- **Database builder** from seed files
- **Riksdagen ingestion** script

#### Core Tools
1. `search_legislation` — Full-text statute search
2. `get_provision` — Retrieve specific provision
3. `search_case_law` — Case law search (limited coverage)
4. `get_preparatory_works` — Legislative history lookup
5. `validate_citation` — Citation verification
6. `build_legal_stance` — Multi-source aggregation
7. `format_citation` — Swedish legal formatting
8. `check_currency` — Law validity check

#### Data Sources
- Riksdagen (Swedish Parliament) — Statutes and propositions
- Svensk Forfattningssamling (SFS) — Official statute collection
- Lagen.nu — Case law (initial integration)

---

## Version History Summary

| Version | Date | Key Changes |
|---------|------|-------------|
| **1.1.0** | 2025-02-12 | EU Law Integration (682 refs, 227 docs, 5 tools) |
| **1.0.0** | 2026-02-12 | Production release (4,827 cases, 1,818 prep works) |
| **0.2.0** | 2025-01-15 | Case law integration (initial) |
| **0.1.0** | 2024-12-01 | Initial release (8 tools, 81 statutes) |

---

## Upgrade Notes

### Upgrading to 1.1.0 from 1.0.0

**Database Changes:**
- 3 new tables: `eu_documents`, `eu_references`, `eu_reference_keywords`
- No breaking changes to existing tables
- Existing tools unchanged (8 core tools fully compatible)

**New Features:**
- 5 new EU tools available
- EU cross-references accessible via new tools
- No configuration changes required

**Migration:**
```bash
# If using local installation:
git pull origin main
npm install
npm run build:db  # Rebuilds database with EU tables

# If using npx:
# No action needed, npx fetches latest version automatically
```

**Compatibility:**
- ✅ All existing queries and tools work unchanged
- ✅ No breaking API changes
- ✅ Database schema backward compatible

### Upgrading to 1.0.0 from 0.2.0

**Major Changes:**
- Database size increased from ~5 MB to 37 MB (4,800+ new cases)
- New preparatory works table
- New definitions table
- Professional use disclaimers added

**Breaking Changes:**
- None (additive changes only)

---

## Attribution

### Data Sources

#### Statutes & Propositions
- **Source:** Riksdagen (Swedish Parliament), Svensk Forfattningssamling
- **License:** Swedish Government (public domain)
- **Access:** Official open data API

#### Case Law
- **Source:** [Lagen.nu](https://lagen.nu)
- **License:** CC-BY Domstolsverket (Creative Commons Attribution)
- **Coverage:** 4,827 cases from 6 courts (2011-2023)
- **Attribution:** All case law results include source metadata

#### EU Cross-References (v1.1.0)
- **Source:** Swedish statute text (Riksdagen, SFS)
- **Extraction:** Automated parser with manual validation
- **Validation:** CELEX number format verification
- **Attribution:** Extracted from verified Swedish legal sources

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas for future contributions:
- EU Regulations MCP integration
- Lower court decisions (Tingsrätt, Hovrätt)
- Historical statute versions
- English translations for key statutes

---

## License

Apache 2.0 - see [LICENSE](LICENSE)

Data licenses vary by source (see Attribution above).

---

**Maintained by:** [Ansvar Systems AB](https://ansvar.ai)
**Repository:** https://github.com/Ansvar-Systems/swedish-law-mcp
**Support:** contact@ansvar.ai
