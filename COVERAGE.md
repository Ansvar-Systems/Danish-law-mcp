# Data Coverage

> Comprehensive breakdown of Swedish legal data in this MCP server

## Overview

| Metric | Value | Notes |
|--------|-------|-------|
| **Statutes** | 717 | Comprehensive Swedish legislation |
| **Provisions** | 31,198 | Individual statute sections |
| **Preparatory Works** | 3,625 | Propositions and SOUs |
| **EU Cross-References** | 668 | 228 EU directives and regulations |
| **Legal Definitions** | 615 | Extracted from statute text |
| **Database Size** | 64.8 MB | SQLite with FTS5 indexes |
| **Last Major Update** | 2026-02-12 | Statute expansion + EU integration |

---

## Statute Coverage

### Overview

| Metric | Value | Growth |
|--------|-------|--------|
| **Total Statutes** | 717 | +636 from v1.0.0 (81 → 717) |
| **Total Provisions** | 31,198 | +14,218 from v1.0.0 (16,980 → 31,198) |
| **Average Provisions/Statute** | 43.5 | Comprehensive coverage |
| **With EU References** | 49 statutes | 68% of database |

### By Domain Distribution

| Domain | Statutes | Example Laws |
|--------|----------|--------------|
| **Administrative Law** | 120+ | Förvaltningslagen, OSL, Kommunallagen |
| **Civil Law** | 90+ | Avtalslagen, Köplagen, Skadestånd |
| **Commercial Law** | 85+ | Aktiebolagslagen, Årsredovisningslagen |
| **Criminal Law** | 75+ | Brottsbalken, Polislagen |
| **Tax Law** | 60+ | Inkomstskattelagen, Mervärdesskattelagen |
| **Labour Law** | 55+ | LAS, MBL, Arbetsmiljölagen |
| **Social Services** | 50+ | Socialtjänstlagen, LSS, LVU |
| **Environmental** | 45+ | Miljöbalken, Plan- och bygglagen |
| **Family Law** | 40+ | Äktenskapsbalken, Föräldrabalken |
| **Other Domains** | 97+ | Various specialized legislation |

**Total:** 717 statutes across all Swedish legal domains

---

## Preparatory Works (Förarbeten)

### Coverage

| Type | Count | Description |
|------|-------|-------------|
| **Propositions** (Prop.) | 3,624 | Government bills |
| **SOUs** | 1 | Official government reports |

**Total:** 3,625 preparatory works (growth: +1,807 from v1.0.0)

### Validation

- ✅ **Riksdagen API verified** — Every proposition validated against official API
- ✅ **Statute linking** — Comprehensive references linking 717 statutes to legislative history
- ✅ **Full-text search** — FTS5 on proposition titles and descriptions
- ✅ **Cross-references** — Bidirectional links between statutes and propositions

### Preparatory Works Features

- ✅ **Legislative intent research** — Understand government's reasoning behind laws
- ✅ **Historical context** — Access to original policy discussions
- ✅ **Multi-source aggregation** — Combine with statutes and case law
- ✅ **Verified data only** — Every proposition verified to exist in Riksdagen

### Preparatory Works Limitations

- ⚠️ **Summaries only** — Full proposition text not included (only metadata)
- ⚠️ **Recent laws prioritized** — Historical pre-2000s propositions less complete
- ❌ **No committee reports** — Riksdagens betänkanden not included

---

## Case Law Coverage

### Current Status

| Metric | Value |
|--------|-------|
| **Total Decisions** | ~4,825 (expanding to est. 12,000-18,000) |
| **Source** | lagen.nu (Open Data from Domstolsverket) |
| **Full-Text Search** | FTS5-indexed |

### Court Coverage

| Court | Swedish Name | Year Range | Est. Cases |
|-------|-------------|------------|------------|
| **Supreme Court** | Högsta domstolen (NJA) | 1981-present | ~5,000-6,000 |
| **Supreme Administrative Court** | Högsta förvaltningsdomstolen (HFD) | 2011-present | ~500-800 |
| **Labour Court** | Arbetsdomstolen (AD) | 1993-present | ~1,500-2,000 |
| **Environmental Court of Appeal** | Mark- och miljööverdomstolen (MÖD) | 2011-present | ~80-100 |
| **Migration Court of Appeal** | Migrationsöverdomstolen (MIG) | 2006-present | ~200-300 |
| **Courts of Appeal** | Rättsfall från hovrätterna (RH) | 1993-present | ~200-400 |
| **Patent and Market Court** | Patent- och marknadsöverdomstolen (PMÖD) | 2016-present | ~100-200 |

### Case Law Features

- RDF metadata from lagen.nu with CC-BY Domstolsverket license
- Full-text search with FTS5 and BM25 ranking
- Court and domain classification
- Date range filtering
- Incremental sync support

### Case Law Limitations

- ⚠️ **Appellate courts only** — No Tingsrätt (district court) decisions (not in lagen.nu)
- ⚠️ **Summaries only** — Full case opinions not always available
- ⚠️ **Source-dependent** — Coverage depends on lagen.nu data availability
- ⚠️ **Supplementary tool** — Use Karnov or Zeteo for comprehensive case law research
- ❌ **No CJEU/ECtHR** — EU and ECHR court decisions not included

## Legal Definitions

### Coverage

| Source | Definitions | Example |
|--------|-------------|---------|
| **Extracted from 717 statutes** | 615 | "Personuppgift" in DSL |

### Definition Features

- ✅ **Source-tracked** — Each definition linked to specific provision
- ✅ **Full-text search** — FTS5 on term and definition text
- ✅ **Contextual** — Includes surrounding legal text
- ✅ **Verified data only** — Extracted directly from statute text

### Definition Limitations

- ⚠️ **Statute-based only** — No case law definitions, no doctrinal definitions
- ⚠️ **Pattern-based extraction** — May miss definitions with non-standard wording
- ⚠️ **Swedish only** — No English translations

---


---

## EU Cross-References

### Overview

| Metric | Value | Notes |
|--------|-------|-------|
| **Total EU References** | 668 | Swedish → EU cross-references |
| **Unique EU Documents** | 228 | Directives and regulations (181 seed + 47 EUR-Lex) |
| **Directives** | 89 | EU directives (39%) |
| **Regulations** | 139 | EU regulations (61%) |
| **Swedish Statutes with EU Refs** | 49 | 68% of database (49/717) |
| **Average Refs per Statute** | 13.6 | Among statutes with EU refs |
| **Provision-Level Linking** | Yes | Many refs linked to specific §§ |
| **EUR-Lex Integration** | ✅ | 47 documents fetched from EUR-Lex API |
| **Coverage Rate** | 97.95% | 668/682 seed references imported |

### Coverage by Legal Domain

| Domain | EU References | Key EU Acts |
|--------|---------------|-------------|
| **Environmental Law** | 71 | REACH, IED, ETS, Waste Framework |
| **Financial Reporting** | 45 | Accounting Directive, Audit Directive |
| **Data Protection** | 44 | GDPR, ePrivacy, Data Protection Directive |
| **Public Procurement** | 67 | Procurement Directives (2014/24, 2014/25) |
| **Company Law** | 35 | Shareholder Rights, Cross-Border Mergers |
| **Labour Safety** | 33 | Framework Directive 89/391, specific directives |
| **Tax Law** | 30 | VAT Directive, DAC6, ATAD |
| **E-Commerce** | 29 | eIDAS, E-Signatures, Distance Selling |
| **Financial Services** | 27 | MiFID II, AIFMD, payment services |

### Top 20 EU Documents by Reference Count

| Rank | EU Document | Type | References | Swedish Statutes |
|------|-------------|------|------------|------------------|
| 1 | **eIDAS** (910/2014) | Regulation | 20 | E-identification, e-commerce |
| 2 | **E-Signatures** (1999/93) | Directive | 15 | Repealed by eIDAS |
| 3 | **GDPR** (2016/679) | Regulation | 15 | Data protection |
| 4 | **Data Protection** (1995/46) | Directive | 14 | Repealed by GDPR |
| 5 | **Market Surveillance** (2019/1020) | Regulation | 14 | Product safety |
| 6 | **PEPP** (2019/1238) | Regulation | 13 | Pension products |
| 7 | **Audit Directive** (2006/43) | Directive | 10 | Statutory audits |
| 8 | **Anti-Money Laundering** (2005/60) | Directive | 10 | AML/CFT |
| 9 | **AML Directive** (2006/70) | Directive | 10 | Implementation measures |
| 10 | **VAT Directive** (2006/112) | Directive | 10 | Value added tax |
| 11 | **Posted Workers** (96/71) | Directive | 10 | Labour mobility |
| 12 | **Working Time** (2003/88) | Directive | 9 | Work hours, rest |
| 13 | **Procurement Directive** (2014/24) | Directive | 9 | Public procurement |
| 14 | **DAC6** (2018/822) | Directive | 8 | Tax transparency |
| 15 | **Shareholder Rights** (2007/36) | Directive | 8 | Corporate governance |
| 16 | **Accounting Directive** (2013/34) | Directive | 8 | Financial reporting |
| 17 | **E-Commerce** (2000/31) | Directive | 8 | Online services |
| 18 | **Waste Framework** (2008/98) | Directive | 7 | Waste management |
| 19 | **Transparency** (2013/50) | Directive | 7 | Securities disclosure |
| 20 | **REACH** (1907/2006) | Regulation | 7 | Chemical substances |

### Swedish Statutes with Most EU References

| Rank | SFS Number | Title | EU Refs | Top EU Acts |
|------|------------|-------|---------|-------------|
| 1 | 1998:808 | Miljöbalken | 71 | REACH, IED, Waste Framework |
| 2 | 1995:1554 | Årsredovisningslagen | 45 | Accounting, Audit directives |
| 3 | 2009:400 | Offentlighets- och sekretesslagen | 44 | GDPR, ePrivacy |
| 4 | 2016:1146 | Upphandlingslag försörjningssektorn | 36 | Procurement Directive 2014/25 |
| 5 | 2005:551 | Aktiebolagslagen | 35 | Shareholder Rights, Mergers |
| 6 | 1977:1160 | Arbetsmiljölagen | 33 | Framework Directive 89/391 |
| 7 | 2016:1145 | Lag om offentlig upphandling | 31 | Procurement Directive 2014/24 |
| 8 | 2011:1244 | Skatteförfarandelagen | 30 | DAC6, ATAD |
| 9 | 2010:900 | Plan- och bygglagen | 29 | Energy Performance, EIA |
| 10 | 1999:1229 | Inkomstskattelagen | 27 | ATAD, Parent-Subsidiary |

### Reference Types Distribution

| Reference Type | Count | Example |
|----------------|-------|---------|
| **Implements** | ~340 (50%) | Swedish law implements EU directive |
| **Supplements** | ~180 (26%) | Swedish law supplements EU regulation |
| **Applies** | ~90 (13%) | EU regulation applies directly |
| **Cites Article** | ~50 (7%) | References specific EU article |
| **References** | ~22 (3%) | General reference |

### EU Law Features

- ✅ **Bi-directional lookup** — Find EU basis for Swedish law, and Swedish implementations of EU law
- ✅ **Provision-level granularity** — Many references linked to specific chapters and sections
- ✅ **Article citations** — Specific EU article references extracted when available
- ✅ **Implementation metadata** — Primary vs supplementary implementation tracking
- ✅ **CELEX numbers** — Official EU document identifiers for all 228 documents
- ✅ **Community designation** — Tracks EU, EG, EEG for historical directives
- ✅ **Verified data only** — All references extracted from verified statute text
- ✅ **EUR-Lex integration** — Automatic metadata fetching from EUR-Lex API for missing EU documents
- ✅ **97.95% coverage** — 668/682 references imported (14 duplicates skipped by design)

### EU Law Limitations

- ⚠️ **Text-based extraction** — References parsed from Swedish statute text, not official EU database
- ⚠️ **No full EU law text** — Only IDs and metadata (full text requires @ansvar/eu-regulations-mcp)
- ⚠️ **No CJEU case law** — Court of Justice decisions not included
- ⚠️ **Implementation gaps** — Some EU directives may be implemented via regulation, not statute
- ⚠️ **Historical coverage** — Older EEG directives may have incomplete metadata
- ❌ **No amendment tracking** — EU directive amendments not automatically reflected

### Data Sources

- **Primary:** Swedish statute text from Riksdagen and SFS (717 statutes)
- **Extraction:** Automated EU reference parser (95%+ accuracy)
- **EUR-Lex API:** Authoritative EU document metadata fetched from EUR-Lex (47 documents)
- **Validation:** CELEX number format verification
- **Update Method:** `npm run fetch:eurlex -- --missing` to fetch new EU documents
- **Last Updated:** 2026-02-12 (v1.1.0)

---

## Data Quality

### Verification & Validation

| Aspect | Status | Method |
|--------|--------|--------|
| **Case law accuracy** | ✅ 100% | RDF metadata validation from lagen.nu |
| **Proposition existence** | ✅ 100% | Riksdagen API verification |
| **Statute text** | ✅ High | Manual curation from official sources |
| **Citation formatting** | ✅ High | Parser validation against Swedish standards |
| **Database integrity** | ✅ 100% | SQLite constraints, FTS5 auto-sync |

### Ingestion Metrics

| Process | Success Rate | Last Run |
|---------|--------------|----------|
| **Case law ingestion** | 100% (0 failures) | 2026-02-12 |
| **Prep works validation** | 100% (0 failures) | 2026-02-12 |
| **Definition extraction** | ~95% (pattern-based) | 2026-02-12 |
| **Database rebuild** | 100% | 2026-02-12 |

---

## Update Frequency

| Data Type | Current Status | Update Method | Frequency |
|-----------|----------------|---------------|-----------|
| **Statutes** | Manual | Curated ingestion | As needed |
| **Case law** | Complete archive | Auto-sync from lagen.nu | Weekly (potential) |
| **Prep works** | Complete | API validation | On-demand |
| **Definitions** | Complete | Automated extraction | With statute updates |

---

## Known Gaps & Future Coverage

### Priority Gaps

1. **Lower courts** (Tingsrätt, Hovrätt) — not available in lagen.nu archive
2. **CJEU case law** — EU Court of Justice decisions not included
3. **Historical statute versions** — pre-consolidation amendments
4. **Full case opinions** — lagen.nu provides summaries only

### Planned Expansions

- [x] **Statute expansion** — 717 statutes with 31,198 provisions (v1.1.0) ✅
- [x] **EU law cross-references** — 668 references to 228 EU documents (v1.1.0) ✅
- [x] **Historical case law** — Full archive scraper now covers NJA from 1981, AD from 1993 ✅
- [x] **PMÖD court** — Patent- och marknadsöverdomstolen added to scraper ✅
- [ ] Lower court coverage (requires alternative data source)
- [ ] Historical statute versions (amendment tracking)
- [ ] English translations for key statutes
- [ ] Expanded preparatory works (full text, not just metadata)

---

## Data Sources

All data sourced from authoritative Swedish legal databases:

1. **[Riksdagen](https://riksdagen.se/)** — Statutes, propositions, SOUs
   - License: Swedish Government (public domain)
   - Access: Official open data API

2. **[Svensk Forfattningssamling](https://svenskforfattningssamling.se/)** — Official statute collection
   - License: Swedish Government (public domain)
   - Access: Web scraping with respect for ToS

3. **[Lagen.nu](https://lagen.nu)** — Court decisions, curated legal database
   - License: CC-BY Domstolsverket
   - Access: RDF/XML feeds, year-based archive scraping
   - Attribution: Included in all case law results
   - Courts: HFD, NJA, AD, MÖD, MIG, RH, PMÖD
   - Archive: NJA from 1981, AD from 1993, HFD from 2011

4. **[EUR-Lex](https://eur-lex.europa.eu/)** — Official EU legislation database
   - License: EU public domain
   - Access: HTML parsing with ELI metadata tags
   - Coverage: 228 EU directives and regulations (metadata only)

---

## Coverage Comparison

### vs. Other Swedish Legal Databases

| Feature | This MCP | Rättsnätet | Zeteo | Karnov | Norstedts Juridik |
|---------|----------|------------|-------|--------|-------------------|
| **Statutes** | 717 | All (~5,000) | All | All | All |
| **Provisions** | 31,198 | All | All | All | All |
| **Case law** | Limited | All courts | All courts | All courts | All courts |
| **Lower courts** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Prep works** | 3,625 (metadata) | Full text | Full text | Full text | Full text |
| **EU cross-refs** | 668 (metadata) | ✅ Full text | ✅ Full text | ✅ Full text | ✅ Full text |
| **Free/Open** | ✅ | Limited | ❌ | ❌ | ❌ |
| **MCP/AI access** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Verified data only** | ✅ | N/A | N/A | N/A | N/A |

**Key Advantage:** Verified-data AI-powered search, completely free and open-source.

---

## Contact

For coverage questions or data quality issues:
- **Issues:** [GitHub Issues](https://github.com/Ansvar-Systems/swedish-law-mcp/issues)
- **Email:** contact@ansvar.ai

---

<p align="center">
  <sub>Last updated: 2026-02-14</sub><br>
  <sub>Next major update: TBD (weekly auto-sync planned)</sub>
</p>
