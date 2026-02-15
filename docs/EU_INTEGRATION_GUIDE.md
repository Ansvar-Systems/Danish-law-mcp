# EU Law Integration Guide

> Comprehensive guide to Swedish ↔ EU legal cross-referencing in the Swedish Law MCP server

## Table of Contents

1. [Overview](#overview)
2. [Understanding the Swedish-EU Legal Relationship](#understanding-the-swedish-eu-legal-relationship)
3. [How to Use the EU Tools](#how-to-use-the-eu-tools)
4. [CELEX Numbers Explained](#celex-numbers-explained)
5. [Example Workflows](#example-workflows)
6. [Data Limitations & Disclaimers](#data-limitations--disclaimers)
7. [Future Enhancements](#future-enhancements)

---

## Overview

The Swedish Law MCP server includes **682 cross-references** linking **49 Swedish statutes** to **227 EU directives and regulations**. This enables bi-directional legal research across Swedish and European legal frameworks.

### What's Included

- **EU basis lookup:** Find which EU directives/regulations a Swedish statute implements
- **Swedish implementation lookup:** Find which Swedish laws implement a specific EU act
- **Provision-level granularity:** Many references linked to specific statute sections
- **Article citations:** Specific EU article references when available
- **Implementation metadata:** Primary vs supplementary implementation tracking
- **CELEX numbers:** Official EU document identifiers

### What's NOT Included

- Full text of EU directives/regulations (use @ansvar/eu-regulations-mcp)
- CJEU (Court of Justice of the European Union) case law
- EU Commission decisions and recommendations
- Lower-level EU implementing acts
- Real-time updates from EUR-Lex

---

## Understanding the Swedish-EU Legal Relationship

### Directives vs Regulations

**EU Directives:**
- Binding on EU member states but require national implementation
- States must achieve the directive's objectives via national legislation
- Implementation deadline specified in directive
- Example: Data Protection Directive (95/46/EG) → implemented via PUL (1998:204)

**EU Regulations:**
- Directly applicable in all member states
- No national implementation required (but may be supplemented)
- Immediately enforceable
- Example: GDPR (2016/679) → directly applies, but Sweden passed DSL (2018:218) to supplement it

### Swedish Implementation Process

1. **EU adopts directive/regulation**
2. **Swedish government analyzes** implementation needs
3. **Proposition (Prop.)** prepared explaining Swedish approach
4. **Riksdagen passes law** implementing directive
5. **Law enters force** (usually by directive's deadline)

### Reference Types in Database

| Type | Meaning | Example |
|------|---------|---------|
| `implements` | Swedish law implements EU directive | DSL implements GDPR |
| `supplements` | Swedish law supplements EU regulation | DSL supplements GDPR |
| `applies` | EU regulation applies directly | GDPR applies in Sweden |
| `cites_article` | References specific EU article | DSL 3:5 cites GDPR Art. 6.1.a |
| `references` | General reference to EU law | OSL references ePrivacy Directive |
| `complies_with` | Swedish law ensures EU compliance | Tax law complies with DAC6 |

---

## How to Use the EU Tools

### Tool 1: `get_eu_basis` — Find EU Law for Swedish Statute

**Use when:** You have a Swedish statute and want to know which EU law it's based on.

**Parameters:**
- `sfs_number` (required) — e.g., "2018:218"
- `include_articles` (optional) — Set to `true` to see specific article references

**Example:**
```json
{
  "tool": "get_eu_basis",
  "arguments": {
    "sfs_number": "2018:218",
    "include_articles": true
  }
}
```

**Returns:**
```json
{
  "statute": {
    "sfs_number": "2018:218",
    "title": "Dataskyddslagen"
  },
  "eu_documents": [
    {
      "id": "regulation:2016/679",
      "type": "regulation",
      "year": 2016,
      "number": 679,
      "celex_number": "32016R0679",
      "short_name": "GDPR",
      "title": "General Data Protection Regulation",
      "reference_type": "supplements",
      "is_primary_implementation": true,
      "articles": ["6.1.a", "7", "13-15", "35"]
    }
  ],
  "total_references": 1
}
```

**Interpretation:**
- DSL is the **primary** Swedish implementation of GDPR
- DSL **supplements** GDPR (regulation applies directly, DSL adds Swedish specifics)
- Specific GDPR articles cited: 6.1.a (consent), 7 (consent conditions), 13-15 (transparency), 35 (DPIA)

---

### Tool 2: `get_swedish_implementations` — Find Swedish Law for EU Act

**Use when:** You have an EU directive/regulation and want to find Swedish implementations.

**Parameters:**
- `eu_document_id` (required) — Format: "directive:YYYY/NNN" or "regulation:YYYY/NNN"
- `primary_only` (optional) — Show only primary implementations
- `in_force_only` (optional) — Exclude repealed laws

**Example:**
```json
{
  "tool": "get_swedish_implementations",
  "arguments": {
    "eu_document_id": "regulation:2016/679",
    "in_force_only": true
  }
}
```

**Returns:**
```json
{
  "eu_document": {
    "id": "regulation:2016/679",
    "type": "regulation",
    "celex_number": "32016R0679",
    "short_name": "GDPR"
  },
  "implementations": [
    {
      "sfs_number": "2018:218",
      "title": "Dataskyddslagen",
      "status": "in_force",
      "is_primary": true,
      "reference_type": "supplements",
      "in_force_date": "2018-05-25"
    },
    {
      "sfs_number": "2009:400",
      "title": "Offentlighets- och sekretesslagen",
      "status": "in_force",
      "is_primary": false,
      "reference_type": "complies_with",
      "in_force_date": "2009-10-01"
    }
  ],
  "total_implementations": 2
}
```

**Interpretation:**
- GDPR has **two** Swedish implementations
- **Primary:** DSL (2018:218) — dedicated GDPR implementation law
- **Supplementary:** OSL (2009:400) — public access law ensuring GDPR compliance

---

### Tool 3: `search_eu_implementations` — Search EU Documents

**Use when:** You want to find EU acts by keyword or topic.

**Parameters:**
- `query` (required) — Search keywords
- `type` (optional) — Filter by "directive" or "regulation"
- `year_from`, `year_to` (optional) — Year range filter

**Example:**
```json
{
  "tool": "search_eu_implementations",
  "arguments": {
    "query": "data protection privacy",
    "type": "regulation",
    "year_from": 2010
  }
}
```

**Returns:**
```json
{
  "results": [
    {
      "id": "regulation:2016/679",
      "type": "regulation",
      "year": 2016,
      "celex_number": "32016R0679",
      "short_name": "GDPR",
      "swedish_implementations": 2,
      "in_force": true
    }
  ],
  "total_results": 1
}
```

---

### Tool 4: `get_provision_eu_basis` — EU Basis for Specific Provision

**Use when:** You want to know the EU law basis for a specific statute section.

**Parameters:**
- `sfs_number` (required) — Swedish statute
- `chapter` (optional) — Chapter number
- `section` (required) — Section reference

**Example:**
```json
{
  "tool": "get_provision_eu_basis",
  "arguments": {
    "sfs_number": "2018:218",
    "chapter": "3",
    "section": "5"
  }
}
```

**Returns:**
```json
{
  "provision": {
    "sfs_number": "2018:218",
    "provision_ref": "3:5",
    "title": "Laglig grund för behandling av personuppgifter"
  },
  "eu_references": [
    {
      "eu_document_id": "regulation:2016/679",
      "short_name": "GDPR",
      "articles": ["6.1.a", "6.1.c"],
      "reference_type": "cites_article"
    }
  ],
  "context": "Denna paragraf kompletterar artikel 6.1 i EU:s dataskyddsförordning..."
}
```

**Interpretation:**
- DSL 3:5 directly implements **GDPR Article 6.1.a and 6.1.c**
- Context shows the Swedish law "supplements" (kompletterar) the EU regulation

---

### Tool 5: `validate_eu_compliance` — Check Implementation Status

**Status:** Future feature (requires @ansvar/eu-regulations-mcp integration)

**Will enable:**
- Side-by-side comparison of Swedish law vs EU requirement
- Identification of implementation gaps
- Validation of article-by-article transposition
- Gold-plating detection (Swedish provisions exceeding EU requirements)

---

## CELEX Numbers Explained

CELEX is the official EU document numbering system used by EUR-Lex.

### Format: `3YYYYXNNNNN`

- **3** — Sector code for EU legislation
- **YYYY** — Year of adoption
- **X** — Document type:
  - **L** = Directive (Legal act)
  - **R** = Regulation
- **NNNNN** — Sequential number (zero-padded to 4 digits)

### Examples

| EU Act | CELEX Number | Breakdown |
|--------|--------------|-----------|
| GDPR (regulation:2016/679) | 32016R0679 | 3-2016-R-0679 |
| Data Protection Directive (directive:1995/46) | 31995L0046 | 3-1995-L-0046 |
| eIDAS (regulation:910/2014) | 32014R0910 | 3-2014-R-0910 |

### Using CELEX Numbers

CELEX numbers can be used to:
- Look up full EU law text on EUR-Lex: `https://eur-lex.europa.eu/eli/[type]/[year]/[number]`
- Cross-reference with @ansvar/eu-regulations-mcp
- Validate EU document authenticity

**Example URL:**
- GDPR: `https://eur-lex.europa.eu/eli/reg/2016/679`

---

## Example Workflows

### Workflow 1: GDPR Compliance Research

**Scenario:** Law firm researching Swedish GDPR compliance requirements

**Steps:**

1. **Find EU basis for DSL**
   ```json
   {"tool": "get_eu_basis", "arguments": {"sfs_number": "2018:218"}}
   ```
   Result: GDPR (regulation:2016/679)

2. **Find all Swedish GDPR implementations**
   ```json
   {"tool": "get_swedish_implementations", "arguments": {"eu_document_id": "regulation:2016/679"}}
   ```
   Result: DSL, OSL

3. **Check specific provision (consent)**
   ```json
   {"tool": "get_provision_eu_basis", "arguments": {"sfs_number": "2018:218", "chapter": "3", "section": "5"}}
   ```
   Result: GDPR Article 6.1.a

4. **Review preparatory works**
   ```json
   {"tool": "get_preparatory_works", "arguments": {"sfs_number": "2018:218"}}
   ```
   Result: Prop. 2017/18:105 (explains Swedish GDPR choices)

**Outcome:** Comprehensive understanding of Swedish GDPR implementation with EU basis and legislative intent.

---

### Workflow 2: Procurement Directive Transposition

**Scenario:** Public sector agency verifying procurement law compliance

**Steps:**

1. **Search EU procurement directives**
   ```json
   {"tool": "search_eu_implementations", "arguments": {"query": "procurement", "type": "directive"}}
   ```
   Result: Directive 2014/24/EU (public sector), 2014/25/EU (utilities)

2. **Find Swedish implementation**
   ```json
   {"tool": "get_swedish_implementations", "arguments": {"eu_document_id": "directive:2014/24"}}
   ```
   Result: Lag om offentlig upphandling (2016:1145)

3. **Verify implementation status**
   ```json
   {"tool": "check_currency", "arguments": {"sfs_number": "2016:1145"}}
   ```
   Result: In force since 2017-01-01

**Outcome:** Confirmed that Swedish procurement law properly implements EU directive.

---

### Workflow 3: Environmental Law Research

**Scenario:** Academic studying Swedish environmental law's EU basis

**Steps:**

1. **Get EU basis for Miljöbalken**
   ```json
   {"tool": "get_eu_basis", "arguments": {"sfs_number": "1998:808"}}
   ```
   Result: 71 EU references (REACH, IED, Waste Framework, etc.)

2. **Analyze specific regulation (REACH)**
   ```json
   {"tool": "get_swedish_implementations", "arguments": {"eu_document_id": "regulation:1907/2006"}}
   ```
   Result: Miljöbalken + sector-specific laws

3. **Build legal stance on chemical regulation**
   ```json
   {"tool": "build_legal_stance", "arguments": {"query": "chemical substances regulation"}}
   ```
   Result: Miljöbalken provisions + REACH + Swedish case law + preparatory works

**Outcome:** Comprehensive understanding of Swedish chemical regulation's EU basis.

---

## Data Limitations & Disclaimers

### Data Source Limitations

1. **Text-Based Extraction**
   - EU references are **parsed from Swedish statute text**
   - Not sourced from official EU databases
   - Parser accuracy: ~95% (some edge cases missed)

2. **No Full EU Law Text**
   - Only EU document IDs and metadata included
   - Full directive/regulation text requires EUR-Lex or @ansvar/eu-regulations-mcp
   - Article citations are extracted but not validated against EU text

3. **Historical Coverage Gaps**
   - Older EEG directives may have incomplete metadata
   - Some historical implementations via regulations (not statutes) may be missed
   - Pre-1995 EU law less comprehensively covered

4. **No Real-Time Updates**
   - EU law amendments not automatically reflected
   - Swedish statute amendments may add/remove EU references
   - Manual updates required

### Legal Disclaimers

⚠️ **NOT LEGAL ADVICE** — This tool is for research purposes only.

**Professional Use:**
- Always verify critical EU citations against EUR-Lex
- Check for EU directive amendments that may affect Swedish law
- Consult preparatory works for implementation choices
- Validate transposition deadlines and Swedish compliance

**Verified-Data-Only Approach:**
- All 682 references extracted from verified Swedish statute text
- No AI-generated or synthesized EU citations
- All CELEX numbers follow official format
- However, errors in Swedish statute text will propagate to database

**Confidentiality:**
- EU cross-reference queries go through Claude API
- For privileged matters, use on-premise deployment
- See [PRIVACY.md](../PRIVACY.md) for Advokatsamfundet compliance

---

## Future Enhancements

### Phase 1: EUR-Lex Metadata (Planned Q2 2025)

- Fetch official EU titles (Swedish and English)
- Add EU directive adoption dates
- Add transposition deadlines
- Mark repealed/amended EU acts

### Phase 2: @ansvar/eu-regulations-mcp Integration (Planned Q3 2025)

**Will enable:**
- Full EU directive/regulation text retrieval by CELEX number
- Side-by-side Swedish/EU provision comparison
- Article-by-article transposition validation
- Automated compliance gap analysis

**Example future query:**
```json
{
  "tool": "compare_implementation",
  "arguments": {
    "sfs_number": "2018:218",
    "chapter": "3",
    "section": "5",
    "eu_article": "6.1.a"
  }
}
```

Returns: Swedish text vs EU text with delta analysis.

### Phase 3: CJEU Case Law (Planned Q4 2025)

- Court of Justice of the European Union decisions
- Preliminary rulings affecting Swedish law
- Cross-references between Swedish cases and CJEU
- Integration with @ansvar/eu-regulations-mcp CJEU database

### Phase 4: Amendment Tracking (2026)

- Track when EU directives are amended
- Alert when Swedish implementation needs update
- Historical timeline of EU law → Swedish law changes
- Automatic transposition deadline monitoring

---

## Resources

### Official EU Resources

- **EUR-Lex:** https://eur-lex.europa.eu/ — Official EU law database
- **CELEX Search:** https://eur-lex.europa.eu/content/tools/TableOfSectors/types_of_documents_in_eurlex.html
- **EU Institutions:** https://europa.eu/european-union/about-eu/institutions-bodies_en

### Swedish Resources

- **Riksdagen EU Info:** https://www.riksdagen.se/sv/eu-information/
- **Swedish Government EU Policy:** https://www.regeringen.se/regeringens-politik/eu/
- **Lagrummet:** https://lagrummet.se/ — Swedish legal information

### Related MCP Servers

- **@ansvar/eu-regulations-mcp** — Full EU law text and CJEU case law (coming soon)
- **@ansvar/swedish-law-mcp** — This server (Swedish law with EU cross-references)

---

## Support

Questions or issues with EU integration?

- **GitHub Issues:** https://github.com/Ansvar-Systems/swedish-law-mcp/issues
- **Email:** contact@ansvar.ai
- **Documentation:** See [EU_USAGE_EXAMPLES.md](EU_USAGE_EXAMPLES.md) for practical examples

---

**Last updated:** 2025-02-12
**Version:** 1.1.0 (EU Integration)
**Coverage:** 682 EU references, 227 documents, 49 Swedish statutes
