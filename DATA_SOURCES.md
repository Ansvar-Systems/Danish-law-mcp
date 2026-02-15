# Data Sources and Authority

This document details the provenance, authority level, and reliability of legal data in this Tool.

---

## Source Hierarchy

### 1. Official Government Sources (Highest Authority)

#### Riksdagen (Swedish Parliament)

**URL**: https://data.riksdagen.se/

**Authority Level**: ⭐⭐⭐⭐⭐ **Official / Authoritative**

**What It Is:**
- Swedish Parliament's official open data API
- Primary source for statute text (Svensk författningssamling - SFS)
- Maintained by Riksdagens förvaltningskontor

**Used For:**
- Statute full text
- SFS numbers and metadata
- Issue dates and in-force dates
- Document structure (chapters, sections, paragraphs)

**Reliability:**
- **High**: Official government publication
- **Currency**: Updated when statutes are published in SFS
- **Completeness**: Comprehensive coverage of all SFS statutes
- **Accuracy**: Authoritative legal text

**Limitations:**
- **Lag Time**: May not include today's publications (typically 24-48 hour delay)
- **Amendments**: Consolidated text may lag amendments (not always real-time)
- **No Annotations**: Plain statutory text without commentary or cross-references
- **API Rate Limits**: 0.5s delay between requests to avoid overload

**Attribution**: Data from Riksdagen under Swedish PSI (Public Sector Information) regulations.

---

#### Domstolsverket (Swedish Courts Administration)

**URL**: https://www.domstol.se/

**Authority Level**: ⭐⭐⭐⭐⭐ **Official / Authoritative**

**What It Is:**
- Swedish National Courts Administration
- Official source for court decisions and judicial information
- Operates official legal information portal (Lagrummet.se)

**Used For** (Indirectly):
- Case law metadata (via lagen.nu, which sources from Domstolsverket)
- Official court decision references
- Precedent identification

**Reliability:**
- **High**: Official government agency
- **Currency**: Decisions published after finalization
- **Accuracy**: Authoritative court decisions

**Direct Access**: This Tool does NOT directly access Domstolsverket APIs. Case law is sourced from **lagen.nu** (see below), which aggregates Domstolsverket data.

---

### 2. Community-Maintained Sources (Secondary Authority)

#### Lagen.nu

**URL**: https://lagen.nu/

**Authority Level**: ⭐⭐⭐ **Community-Maintained / Supplementary**

**What It Is:**
- Community-driven legal information website
- Aggregates and republishes Swedish court decisions
- Maintained by volunteers and legal tech enthusiasts
- Licensed under **CC-BY Domstolsverket** (Creative Commons Attribution)

**Used For:**
- Case law (rättsfall) full text and summaries
- Court decision metadata (case numbers, decision dates, courts)
- Cross-references between statutes and case law
- Keyword tagging of cases

**Reliability:**
- **Medium-High**: Generally accurate but not official
- **Currency**: Updated regularly but may lag official sources by days/weeks
- **Completeness**: Not comprehensive — coverage varies by court and time period
- **Accuracy**: Community transcription; errors possible

**Limitations:**
- ⚠️ **Not Official**: Lagen.nu is NOT a government source
- ⚠️ **Transcription Errors**: Manual entry can introduce mistakes
- ⚠️ **Incomplete Coverage**: Not all court decisions are included
- ⚠️ **Volunteer-Driven**: No SLA or guaranteed update cadence
- ⚠️ **Missing Recent Cases**: New decisions may not be immediately available

**Why We Use It:**
- **Open Access**: Free, machine-readable case law
- **Best Available Option**: No official open API for Swedish case law
- **CC-BY License**: Legal to aggregate and redistribute with attribution
- **Good Faith Effort**: Community maintains high quality standards

**Attribution**:
> Case law data from **lagen.nu**, licensed CC-BY Domstolsverket.
> Lagen.nu is a community-maintained project, not an official government source.

**Cross-Check Required**: Always verify case law citations with:
- **Lagrummet.se** (official portal)
- **Karnov** or **Juno** (commercial databases with editorial oversight)
- **Original court opinions** (via Domstol.se or case filing systems)

---

### 3. Commercial Legal Databases (Professional Standard)

This Tool does **NOT** include commercial database content, but professional users should cross-check with these authoritative sources:

#### Karnov (Wolters Kluwer)

**URL**: https://pro.karnovgroup.se/

**Authority Level**: ⭐⭐⭐⭐⭐ **Editorially Verified / Professional Standard**

**What It Is:**
- Leading Swedish legal database (acquired by Thomson Reuters)
- Editorially verified statute text and case law
- Annotations, commentary, and cross-references by legal experts
- Real-time updates and currency guarantees

**Why It's Better:**
- **Editorial Oversight**: Legal experts verify all content
- **Annotations**: Commentary explains application and interpretation
- **Cross-References**: Linked to preparatory works, case law, and doctrine
- **Currency SLA**: Guaranteed update timeframes
- **No Transcription Errors**: Direct feed from official sources

**Cost**: Subscription-based (€100-300/month per user)

---

#### Juno (Norstedts Juridik)

**URL**: https://juno.nj.se/

**Authority Level**: ⭐⭐⭐⭐⭐ **Editorially Verified / Professional Standard**

**What It Is:**
- Major Swedish legal database (Norstedts Juridik)
- Competing with Karnov for professional market
- Similar features: annotations, commentary, editorial oversight

---

#### Zeteo (Wolters Kluwer)

**URL**: https://zeteo.wolterskluwer.se/

**Authority Level**: ⭐⭐⭐⭐⭐ **Editorially Verified / Professional Standard**

**What It Is:**
- Wolters Kluwer's comprehensive legal information system
- Integrated access to statutes, case law, and legal literature

---

#### Lagrummet.se (Official Portal)

**URL**: https://lagrummet.se/

**Authority Level**: ⭐⭐⭐⭐⭐ **Official / Free**

**What It Is:**
- Domstolsverket's official legal information portal
- Free access to statutes and case law
- Not as feature-rich as commercial databases but authoritative

**Best For:**
- Verifying statute text without paid subscription
- Checking case law citations
- Official reference for professional work

---

## Data Quality Comparison

| Source | Authority | Currency | Annotations | Cost | Professional Use |
|--------|-----------|----------|-------------|------|------------------|
| **Riksdagen** | Official | High | None | Free | ✅ Statute text verification |
| **Domstolsverket** | Official | High | None | Free | ✅ Case law verification |
| **Lagen.nu** | Community | Medium | None | Free | ⚠️ Supplementary only |
| **Karnov** | Professional | Very High | Expert | €€€ | ✅ Primary professional source |
| **Juno** | Professional | Very High | Expert | €€€ | ✅ Primary professional source |
| **Lagrummet.se** | Official | High | None | Free | ✅ Official verification |

---

## How This Tool Uses Sources

### Statute Data Pipeline

```
Riksdagen API → Ingestion Script → JSON Seed Files → SQLite Database → MCP Tool
```

1. **Manual Ingestion**: `npm run ingest -- <SFS-number>`
2. **Parsing**: Extract chapters, sections, provision text
3. **Storage**: Normalized in SQLite with FTS5 indexing
4. **Update Check**: `npm run check-updates` compares local vs. remote dates

**Frequency**: Manual (user-initiated) — NO automatic sync

**Lag Time**: Depends on when user last ran `npm run ingest:relevant`

---

### Case Law Data Pipeline

```
Lagen.nu RDF Feed → Sync Script → SQLite Database → MCP Tool
```

1. **Incremental Sync**: `npm run sync:cases` fetches new cases since last sync
2. **RDF Parsing**: Extract court, case number, decision date, summary
3. **FTS5 Indexing**: Full-text search on summaries and keywords
4. **Metadata Tracking**: Last sync timestamp stored in `case_law_sync_metadata` table

**Frequency**: Manual (user-initiated) — recommended weekly

**Lag Time**:
- Lagen.nu may lag Domstolsverket by days/weeks
- This Tool may lag lagen.nu by weeks (if user doesn't sync)

---

## Data Freshness Strategy

### Current Mechanism: Manual Updates

**Problem**: Data goes stale quickly
**Impact**: Professional users may rely on outdated law

**How to Update:**

```bash
# Check if statutes need updates
npm run check-updates

# Re-ingest updated statutes
npm run ingest -- 2018:218 data/seed/2018_218.json

# Sync case law
npm run sync:cases

# Rebuild database
npm run build:db
```

**Recommended Frequency:**
- **Statutes**: Monthly check via `npm run check-updates`
- **Case law**: Weekly sync via `npm run sync:cases`
- **Emergency**: Immediately before critical legal work

---

### Proposed Automation (Not Yet Implemented)

**GitHub Actions Workflow** (Future Enhancement):

```yaml
name: Sync Legal Data
on:
  schedule:
    - cron: '0 2 * * 1'  # Every Monday at 2 AM UTC

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run check-updates
      - run: npm run sync:cases
      - run: npm run build:db
      - uses: stefanzweifel/git-auto-commit-action@v4
        with:
          commit_message: 'chore: weekly legal data sync'
```

**Benefits:**
- Automatic weekly case law sync
- Statute staleness monitoring
- CI/CD database rebuilds
- Version-controlled data updates

**Risks:**
- Breaking changes in upstream APIs
- Large database commits (SQLite binary blobs)
- Requires careful testing before merging

---

## Attribution Requirements

### Lagen.nu Data (CC-BY Domstolsverket)

When using case law data from this Tool, you MUST attribute:

**In Research Notes:**
> Case law data sourced from lagen.nu (https://lagen.nu), licensed CC-BY Domstolsverket.

**In Tool Responses** (Already Implemented):
All case law results include `_metadata.source` and `_metadata.attribution` fields.

**In Publications/Papers:**
If citing statistics or aggregated case law data:
> Swedish court decisions accessed via lagen.nu (https://lagen.nu), a community-maintained
> legal information resource. Data originally published by Domstolsverket, licensed CC-BY.

### Riksdagen Data (Public Sector Information)

Riksdagen data is published under Swedish PSI regulations (Public Sector Information Act).

**No Specific Attribution Required** by law, but recommended:
> Statute text from Riksdagen Open Data (https://data.riksdagen.se/)

---

## Verification Workflow for Professional Use

### Recommended Process

1. **Initial Research**: Use this Tool for preliminary searches

2. **Official Verification**:
   ```
   Statute Text:   Riksdagen.se or Lagrummet.se
   Case Law:       Domstol.se or Lagrummet.se
   ```

3. **Professional Database Cross-Check**:
   ```
   Use Karnov/Juno for:
   - Editorial annotations
   - Cross-references to preparatory works
   - Commentary on application
   - Currency guarantees
   ```

4. **Document Sources**:
   - Cite official sources in legal work (not this Tool)
   - Keep audit trail of verification steps

---

## Source Authority Matrix

### When to Trust Each Source

| Legal Task | This Tool | Lagrummet | Karnov/Juno |
|------------|-----------|-----------|-------------|
| **Quick lookup** | ✅ Fast | ✅ Official | ✅ Professional |
| **Preliminary research** | ✅ Good starting point | ✅ Authoritative | ✅ Comprehensive |
| **Cite in court filing** | ❌ Verify first | ✅ Acceptable | ✅ Professional standard |
| **Client advice** | ❌ Verify first | ⚠️ Verify currency | ✅ Safe |
| **Complex interpretation** | ❌ No annotations | ⚠️ No commentary | ✅ Expert commentary |
| **Historical research** | ❌ Limited versions | ⚠️ Limited | ✅ Historical versions |

---

## Transparency Commitments

### What We Disclose

1. **Source Provenance**: Every result indicates data source
2. **Currency Metadata**: Last-updated timestamps in responses
3. **Staleness Warnings**: Alerts when data >30 days old
4. **Coverage Gaps**: Explicit notice of missing sources (EU law, etc.)
5. **Authority Levels**: Clear distinction between official and community sources

### What We Don't Track

- Individual user queries (not logged by this Tool)
- Query frequency or patterns
- User identity or organization
- Client matter details

**Privacy Note**: See [PRIVACY.md](PRIVACY.md) for full data handling details.

---

## Source Updates and Monitoring

### How to Check Data Currency

**Check Statute Currency:**
```bash
npm run check-updates
# Shows which SFS entries have remote updates
```

**Check Case Law Currency:**
```sql
SELECT last_sync_date, cases_count
FROM case_law_sync_metadata
WHERE id = 1;
```

**Check via Tool:**
Use `check_currency` tool — includes `case_law_stats` in response:
```json
{
  "case_law_stats": {
    "last_updated": "2026-02-05T10:30:00Z",
    "total_cases": 10453,
    "source": "lagen.nu"
  }
}
```

---

## Upstream Source Changes

### If Riksdagen API Changes

**Symptoms:**
- Ingestion scripts fail
- Empty or malformed data

**Mitigation:**
- Monitor [Riksdagen API status](https://data.riksdagen.se/data/)
- Check GitHub issues for breaking changes
- Update parsers in `scripts/ingest-riksdagen.ts`

### If Lagen.nu Changes

**Symptoms:**
- Case law sync fails
- Missing case metadata

**Mitigation:**
- Monitor [lagen.nu GitHub](https://github.com/staffanm/ferenda)
- Check RDF feed structure changes
- Update parsers in `scripts/lib/lagennu-parser.ts`

---

## Contributing Data Quality Improvements

### How to Report Data Issues

**Found an error?** Open a GitHub issue with:
1. **Provision/Case ID**: Specific SFS or case number
2. **Expected**: What the official source says
3. **Actual**: What this Tool returns
4. **Source**: Link to official source showing correct data

**Label**: `data-quality`

### How to Contribute New Sources

Want to add additional legal sources (e.g., EU law, Nordic treaties)?

1. **Propose Source**: Open GitHub discussion
2. **Verify License**: Ensure data is openly licensed or API terms allow use
3. **Implement Parser**: Follow existing patterns in `scripts/`
4. **Add Tests**: Include test data and coverage
5. **Document Authority**: Update this file with source authority analysis

---

## Summary: Source Trust Levels

**For Professional Legal Work:**

| Source | Use Case | Trust Level |
|--------|----------|-------------|
| **Riksdagen** | Statute text | ⭐⭐⭐⭐⭐ Fully trustworthy |
| **Domstolsverket (direct)** | Case law | ⭐⭐⭐⭐⭐ Fully trustworthy |
| **Lagen.nu** | Case law (via this Tool) | ⭐⭐⭐ Supplementary — verify |
| **Karnov/Juno** | All legal research | ⭐⭐⭐⭐⭐ Professional standard |
| **This Tool** | Initial research | ⭐⭐⭐ Starting point — verify |

**Golden Rule**: Always verify with official or professional-grade sources before relying on data in legal work.

---

**Last Updated**: 2026-02-12
**Tool Version**: 0.1.0 (Pilot/Research)
