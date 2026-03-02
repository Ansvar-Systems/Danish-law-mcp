# Danish Law MCP Server

**The Retsinformation alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Fdanish-law-mcp.svg)](https://www.npmjs.com/package/@ansvar/danish-law-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/Denmark-law-mcp?style=social)](https://github.com/Ansvar-Systems/Denmark-law-mcp)
[![CI](https://github.com/Ansvar-Systems/Denmark-law-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Ansvar-Systems/Denmark-law-mcp/actions/workflows/ci.yml)
[![Daily Data Check](https://github.com/Ansvar-Systems/Denmark-law-mcp/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/Denmark-law-mcp/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/EU_INTEGRATION_GUIDE.md)
[![Provisions](https://img.shields.io/badge/provisions-620%2C940-blue)](docs/EU_INTEGRATION_GUIDE.md)

Query **62,764 Danish laws** -- from Databeskyttelsesloven and Straffeloven to Selskabsloven, Forvaltningsloven, and more -- directly from Claude, Cursor, or any MCP-compatible client.

If you're building legal tech, compliance tools, or doing Danish legal research, this is your verified reference database.

Built by [Ansvar Systems](https://ansvar.eu) -- Stockholm, Sweden

---

## Why This Exists

Danish legal research means navigating retsinformation.dk, cross-referencing between lovbekendtgørelser (consolidated laws), forslag (bills), betænkninger (committee reports), and EUR-Lex. Whether you're:

- A **lawyer** validating citations in a brief or contract
- A **compliance officer** checking Databeskyttelsesloven obligations or GDPR alignment
- A **legal tech developer** building tools on Danish law
- A **researcher** tracing legislative history from lovforslag to enacted statute

...you shouldn't need dozens of browser tabs and manual PDF cross-referencing. Ask Claude. Get the exact provision. With context.

This MCP server makes Danish law **searchable, cross-referenceable, and AI-readable**.

---

## Quick Start

### Use Remotely (No Install Needed)

> Connect directly to the hosted version -- zero dependencies, nothing to install.

**Endpoint:** `https://danish-law-mcp.fly.dev/mcp`

> **Note:** This server is hosted on Fly.io rather than Vercel because the database (1.6 GB) exceeds Vercel's 50 MB deployment limit. The endpoint is otherwise identical in behaviour to other Ansvar Law MCP servers.

| Client | How to Connect |
|--------|---------------|
| **Claude.ai** | Settings > Connectors > Add Integration > paste URL |
| **Claude Code** | `claude mcp add danish-law --transport http https://danish-law-mcp.fly.dev/mcp` |
| **Claude Desktop** | Add to config (see below) |
| **GitHub Copilot** | Add to VS Code settings (see below) |

**Claude Desktop** -- add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "danish-law": {
      "type": "url",
      "url": "https://danish-law-mcp.fly.dev/mcp"
    }
  }
}
```

**GitHub Copilot** -- add to VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "danish-law": {
      "type": "http",
      "url": "https://danish-law-mcp.fly.dev/mcp"
    }
  }
}
```

### Use Locally (npm)

```bash
npx @ansvar/danish-law-mcp
```

**Claude Desktop** -- add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "danish-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/danish-law-mcp"]
    }
  }
}
```

**Cursor / VS Code:**

```json
{
  "mcp.servers": {
    "danish-law": {
      "command": "npx",
      "args": ["-y", "@ansvar/danish-law-mcp"]
    }
  }
}
```

## Example Queries

Once connected, just ask naturally -- in Danish or English:

- *"Hvad siger Databeskyttelsesloven § 5 om behandling af personoplysninger?"*
- *"Er Straffelovens § 263 om hacking stadig i kraft?"*
- *"Find bestemmelser om offentlighedsprincippet"*
- *"Hvad siger konkurrenceretten om misbrug af dominerende stilling?"*
- *"Valider citatet 'Straffelovens § 263'"*
- *"Opbyg en juridisk argumentation om GDPR-forpligtelser for virksomheder"*
- *"Which Danish laws implement the GDPR?"*
- *"What does Forvaltningsloven say about administrative procedures?"*

---

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| **Laws** | 62,764 laws | Complete corpus from retsinformation.dk |
| **Provisions** | 620,940 sections | Full-text searchable with FTS5 |
| **Premium: Case Law** | 3,918 rulings | Højesteret, Landsretter decisions |
| **Premium: Preparatory Works** | 4,412 documents | Lovforslag, betænkninger |
| **Database Size** | 1.6 GB | Optimized SQLite, hosted on Fly.io |
| **Daily Updates** | Automated | Freshness checks against retsinformation.dk |

**Verified data only** -- every citation is validated against official sources (retsinformation.dk). Zero LLM-generated content.

---

## See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All statute text is ingested from retsinformation.dk (Danish Ministry of Justice)
- Provisions are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing -- the database contains statute text, not AI interpretations

**Smart Context Management:**
- Search returns ranked provisions with BM25 scoring (safe for context)
- Provision retrieval gives exact text by law identifier + paragraph/section
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
retsinformation.dk API --> Parse --> SQLite --> FTS5 snippet() --> MCP response
                            ^                        ^
                     Provision parser         Verbatim database query
```

### Traditional Research vs. This MCP

| Traditional Approach | This MCP Server |
|---------------------|-----------------|
| Search retsinformation.dk by document number | Search by plain Danish: *"personoplysninger samtykke"* |
| Navigate multi-paragraph statutes manually | Get the exact provision with context |
| Manual cross-referencing between laws | `build_legal_stance` aggregates across sources |
| "Er denne lov stadig i kraft?" → check manually | `check_currency` tool → answer in seconds |
| Find EU basis → dig through EUR-Lex | `get_eu_basis` → linked EU directives instantly |
| Check multiple sites for amendments | Daily automated freshness checks |
| No API, no integration | MCP protocol → AI-native |

**Traditional:** Search retsinformation.dk → Download PDF → Ctrl+F → Cross-reference with betænkning → Check EUR-Lex for EU basis → Repeat

**This MCP:** *"Hvad er EU-retsgrundlaget for Databeskyttelsesloven § 5 om samtykke?"* → Done.

---

## Available Tools (13)

### Core Legal Research Tools (8)

| Tool | Description |
|------|-------------|
| `search_legislation` | FTS5 search on 620,940 provisions with BM25 ranking. Supports quoted phrases, boolean operators, prefix wildcards |
| `get_provision` | Retrieve specific provision by law identifier + paragraph/section (e.g., "Straffeloven" + "263") |
| `check_currency` | Check if a law is in force, amended, or repealed |
| `validate_citation` | Validate citation against database -- zero-hallucination check. Supports "Straffelovens § 263", "Databeskyttelsesloven § 5" |
| `build_legal_stance` | Aggregate citations from multiple laws for a legal topic |
| `format_citation` | Format citations per Danish conventions (full/short/pinpoint) |
| `list_sources` | List all available laws with metadata, coverage scope, and data provenance |
| `about` | Server info, capabilities, dataset statistics, and coverage summary |

### EU Law Integration Tools (5)

| Tool | Description |
|------|-------------|
| `get_eu_basis` | Get EU directives/regulations that a Danish statute transposes (e.g., Databeskyttelsesloven → GDPR) |
| `get_danish_implementations` | Find Danish laws implementing a specific EU act |
| `search_eu_implementations` | Search EU documents with Danish implementation counts |
| `get_provision_eu_basis` | Get EU law references for a specific provision |
| `validate_eu_compliance` | Check transposition status of Danish statutes against EU directives |

---

## EU Law Integration

Denmark is a full EU member state. Danish law directly transposes EU directives into national legislation:

| Danish Law | EU Basis |
|-----------|----------|
| **Databeskyttelsesloven** | GDPR (Regulation 2016/679) |
| **Implementeret e-Privacy** | ePrivacy Directive (2002/58/EC) |
| **Konkurrenceretten** | EU Treaty Articles 101-102 (TFEU) |

The EU integration tools support bi-directional lookup: find which EU act a Danish statute transposes, or find all Danish laws implementing a given EU regulation.

> **Denmark and EU opt-outs:** Denmark maintains opt-outs from certain EU policy areas (including Justice and Home Affairs, under Protocol 22 to the Maastricht Treaty). However, data protection law (GDPR), commercial law, and competition law are all fully aligned with EU frameworks. The EU tools in this MCP reflect full transposition coverage for these areas.

See [EU_INTEGRATION_GUIDE.md](docs/EU_INTEGRATION_GUIDE.md) for detailed documentation and [EU_USAGE_EXAMPLES.md](docs/EU_USAGE_EXAMPLES.md) for practical examples.

---

## Data Sources & Freshness

All content is sourced from authoritative Danish legal databases:

- **[Retsinformation](https://retsinformation.dk/)** -- The official Danish law portal, operated by the Danish Ministry of Justice. Provides the complete corpus of consolidated Danish laws (lovbekendtgørelser), acts (love), and statutory orders (bekendtgørelser).
- **[EUR-Lex](https://eur-lex.europa.eu/)** -- Official EU law database (metadata only)

### Data Provenance

| Field | Value |
|-------|-------|
| **Authority** | Danish Ministry of Justice / Retsinformation |
| **Retrieval method** | Bulk download from retsinformation.dk API |
| **Language** | Danish (primary) |
| **License** | Open data (retsinformation.dk) |
| **Coverage** | All 62,764 consolidated Danish laws |
| **Last ingested** | 2026-02-22 |

### Automated Freshness Checks (Daily)

A [daily GitHub Actions workflow](.github/workflows/check-updates.yml) monitors retsinformation.dk for changes:

| Source | Check | Method |
|--------|-------|--------|
| **Law amendments** | retsinformation.dk API date comparison | All 62,764 laws checked |
| **New laws** | retsinformation.dk publications (90-day window) | Diffed against database |
| **Case law** | Court portal entry count | Compared to database |
| **Preparatory works** | Lovforslag API (30-day window) | New proposals detected |
| **EU reference staleness** | Git commit timestamps | Flagged if >90 days old |

The workflow supports `auto_update: true` dispatch for automated sync, rebuild, version bump, and npm publishing.

---

## Premium Tier

The premium tier adds version history, amendment tracking, and extended case law coverage:

| Feature | Free | Premium |
|---------|------|---------|
| Full statute corpus (62,764 laws) | Yes | Yes |
| Full-text search (620,940 provisions) | Yes | Yes |
| EU law cross-references | Yes | Yes |
| Citation validation | Yes | Yes |
| Case law (3,918 rulings) | No | Yes |
| Preparatory works (4,412 documents) | No | Yes |
| Amendment history (`get_*_history`) | No | Yes |
| Version diff (`diff_*`) | No | Yes |
| Recent changes (`get_recent_changes`) | No | Yes |

Premium is enabled via the `PREMIUM_ENABLED` environment variable. Contact [hello@ansvar.ai](mailto:hello@ansvar.ai) for access.

---

## Security

This project uses multiple layers of automated security scanning:

| Scanner | What It Does | Schedule |
|---------|-------------|----------|
| **CodeQL** | Static analysis for security vulnerabilities | Weekly + PRs |
| **Semgrep** | SAST scanning (OWASP top 10, secrets, TypeScript) | Every push |
| **Gitleaks** | Secret detection across git history | Every push |
| **Trivy** | CVE scanning on filesystem and npm dependencies | Daily |
| **Docker Security** | Container image scanning + SBOM generation | Daily |
| **Socket.dev** | Supply chain attack detection | PRs |
| **OSSF Scorecard** | OpenSSF best practices scoring | Weekly |
| **Dependabot** | Automated dependency updates | Weekly |

See [SECURITY.md](SECURITY.md) for the full policy and vulnerability reporting.

---

## Important Disclaimers

### Legal Advice

> **THIS TOOL IS NOT LEGAL ADVICE**
>
> Statute text is sourced from official retsinformation.dk publications (Danish Ministry of Justice). However:
> - This is a **research tool**, not a substitute for professional legal counsel
> - **Court case coverage in the free tier is limited** -- do not rely solely on this for case law research
> - **Verify critical citations** against primary sources for court filings
> - **EU cross-references** are extracted from Danish statute text and EUR-Lex metadata, not substitute for full EUR-Lex legal text
> - **Municipal and regional regulations are not included** -- this covers national Danish law only

**Before using professionally, read:** [DISCLAIMER.md](DISCLAIMER.md) | [PRIVACY.md](PRIVACY.md)

### Client Confidentiality

Queries go through the Claude API. For privileged or confidential matters, use on-premise deployment. See [PRIVACY.md](PRIVACY.md) for Advokatsamfundet (Danish Bar Association) compliance guidance.

---

## Documentation

- **[EU Integration Guide](docs/EU_INTEGRATION_GUIDE.md)** -- Detailed EU cross-reference documentation
- **[EU Usage Examples](docs/EU_USAGE_EXAMPLES.md)** -- Practical EU lookup examples
- **[Security Policy](SECURITY.md)** -- Vulnerability reporting and scanning details
- **[Disclaimer](DISCLAIMER.md)** -- Legal disclaimers and professional use notices
- **[Privacy](PRIVACY.md)** -- Client confidentiality and data handling

---

## Development

### Setup

```bash
git clone https://github.com/Ansvar-Systems/Denmark-law-mcp
cd Denmark-law-mcp
npm install
npm run build
npm test
```

### Running Locally

```bash
npm run dev                                       # Start MCP server
npx @anthropic/mcp-inspector node dist/index.js   # Test with MCP Inspector
```

### Data Management

```bash
npm run ingest                             # Ingest laws from retsinformation.dk
npm run ingest:auto-all -- --scope all-laws --dry-run  # Coverage audit
npm run ingest:auto-all -- --scope all-laws             # Ingest full corpus
npm run ingest:cases:full-archive          # Ingest case law (full archive)
npm run sync:cases                         # Ingest case law (incremental)
npm run sync:prep-works                    # Sync preparatory works
npm run extract:definitions                # Extract legal definitions
npm run build:db                           # Rebuild SQLite database
npm run check-updates                      # Check for amendments
npm run drift:detect                       # Run drift detection
```

### Performance

- **Search Speed:** <100ms for most FTS5 queries
- **Database Size:** 1.6 GB (Fly.io deployment due to size)
- **Reliability:** 100% ingestion success rate

---

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** -- MCP servers that work together for end-to-end compliance coverage:

### [@ansvar/eu-regulations-mcp](https://github.com/Ansvar-Systems/EU_compliance_MCP)
**Query 49 EU regulations directly from Claude** -- GDPR, AI Act, DORA, NIS2, MiFID II, eIDAS, and more. Full regulatory text with article-level search. `npx @ansvar/eu-regulations-mcp`

### @ansvar/danish-law-mcp (This Project)
**Query 62,764 Danish laws directly from Claude** -- Databeskyttelsesloven, Straffeloven, Selskabsloven, Forvaltningsloven, Konkurrenceretten, and more. Full provision text with EU cross-references. `npx @ansvar/danish-law-mcp`

### [@ansvar/swedish-law-mcp](https://github.com/Ansvar-Systems/swedish-law-mcp)
**Query Swedish statutes directly from Claude** -- DSL, BrB, ABL, and more. Full provision text with EU cross-references. `npx @ansvar/swedish-law-mcp`

### [@ansvar/norwegian-law-mcp](https://github.com/Ansvar-Systems/Norway-law-mcp)
**Query Norwegian legislation directly from Claude** -- Lovdata corpus with EU EEA cross-references. `npx @ansvar/norwegian-law-mcp`

### [@ansvar/us-regulations-mcp](https://github.com/Ansvar-Systems/US_Compliance_MCP)
**Query US federal and state compliance laws** -- HIPAA, CCPA, SOX, GLBA, FERPA, and more. `npx @ansvar/us-regulations-mcp`

### [@ansvar/ot-security-mcp](https://github.com/Ansvar-Systems/ot-security-mcp)
**Query IEC 62443, NIST 800-82/53, and MITRE ATT&CK for ICS** -- Specialized for OT/ICS environments. `npx @ansvar/ot-security-mcp`

### [@ansvar/automotive-cybersecurity-mcp](https://github.com/Ansvar-Systems/Automotive-MCP)
**Query UNECE R155/R156 and ISO 21434** -- Automotive cybersecurity compliance. `npx @ansvar/automotive-cybersecurity-mcp`

### [@ansvar/sanctions-mcp](https://github.com/Ansvar-Systems/Sanctions-MCP)
**Offline-capable sanctions screening** -- OFAC, EU, UN sanctions lists. `pip install ansvar-sanctions-mcp`

**70+ national law MCPs** covering Australia, Belgium, Brazil, Canada, Finland, France, Germany, Ghana, Iceland, India, Ireland, Israel, Italy, Japan, Kenya, Netherlands, Nigeria, Norway, Poland, Singapore, Slovenia, South Korea, Sweden, Switzerland, Thailand, UAE, UK, and more.

---

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas:
- Court case law expansion (Højesteret and Landsretter full archives)
- EU Regulations MCP integration (full EU law text, CJEU case law)
- Historical statute versions and amendment tracking
- Lower court decisions (Byretter archives)
- English translations for key statutes

---

## Roadmap

- [x] **Full corpus ingestion** -- 62,764 Danish laws from retsinformation.dk
- [x] **EU law integration** -- Danish statute transposition cross-references
- [x] **Premium tier** -- case law (3,918 rulings) and preparatory works (4,412 documents)
- [x] **Fly.io deployment** -- 1.6 GB database hosted on Fly.io
- [x] **npm package publication** -- `@ansvar/danish-law-mcp`
- [ ] Court case law expansion (Byretter full archives)
- [ ] Full EU text integration (via @ansvar/eu-regulations-mcp)
- [ ] Historical statute versions (amendment tracking)
- [ ] English translations for key statutes
- [ ] Web API for programmatic access

---

## Citation

If you use this MCP server in academic research:

```bibtex
@software{danish_law_mcp_2026,
  author = {Ansvar Systems AB},
  title = {Danish Law MCP Server: Production-Grade Legal Research Tool},
  year = {2026},
  url = {https://github.com/Ansvar-Systems/Denmark-law-mcp},
  note = {Comprehensive Danish legal database with 62,764 laws and 620,940 provisions from retsinformation.dk}
}
```

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

### Data Licenses

- **Laws & Statutory Orders:** Danish Ministry of Justice via retsinformation.dk (open data)
- **Case Law:** Højesteret and Landsretter (Danish court system)
- **EU Metadata:** EUR-Lex (EU public domain)

---

## About Ansvar Systems

We build AI-accelerated compliance and legal research tools for the European market. This MCP server started as our internal reference tool for Danish law -- turns out everyone building for the Danish and Nordic markets has the same research frustrations.

So we're open-sourcing it. Navigating 62,764 laws on retsinformation.dk shouldn't require a law degree.

**[ansvar.eu](https://ansvar.eu)** -- Stockholm, Sweden

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
