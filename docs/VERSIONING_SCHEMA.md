# Historical Versioning Schema Design

## Swedish Statute Amendment Patterns

### Amendment Keywords (Observed in Corpus)

Swedish statutes use these standard phrases to indicate amendments:

1. **Lag (YYYY:NNN)** - "Amended by Law YYYY:NNN"
   - Appears at end of provision text
   - Example: `Lag (2021:1174).` means this provision was last amended by SFS 2021:1174

2. **Upphävd genom lag (YYYY:NNN)** - "Repealed by Law YYYY:NNN"
   - Indicates provision or entire statute was repealed

3. **Ny lydelse** - "New wording"
   - Used in amending statutes to show replacement text

4. **Införd genom lag** - "Introduced by law"
   - Shows when provision was added to existing statute

5. **Har upphävts genom lag** - "Has been repealed by law"
   - Used in transition provisions

### Consolidation Practice

**Riksdagen consolidates statute text** - the API returns the **current consolidated version** with amendment citations appended to each provision. Historical text must be reconstructed from:

1. **Original statute text** (SFS YYYY:NNN)
2. **Amending statute text** (SFS YYYY:MMM) - contains "ändringar" sections listing specific provision changes

Example from Dataskyddslagen (2018:218):
- Original: SFS 2018:218 (issued 2018-04-19, in force 2018-05-25)
- Amended by: 2018:1248, 2018:2002, 2021:1174, 2022:444, 2025:187, 2025:256
- Current text shows: `1:3 ... Lag (2021:1174).` indicating last amendment

### Amendment Metadata Sources

1. **Provision text suffix**: `Lag (YYYY:NNN).` at end
2. **Riksdagen document metadata**: HTML contains fields like "Upphävd", "Författningen har upphävts genom"
3. **Cross-references table**: Already captures "amended_by" relationships
4. **Amending statute documents**: Contain sections like "Ändringar i dataskyddslagen (2018:218)"

## Current Schema Status

### Existing Tables (Already Implemented)

```sql
-- Current provision snapshot (consolidated text)
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

-- Historical versions (16,980 records for 81 statutes already ingested!)
CREATE TABLE legal_provision_versions (
  id INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES legal_documents(id),
  provision_ref TEXT NOT NULL,
  chapter TEXT,
  section TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  valid_from TEXT,  -- ISO date when this version became effective
  valid_to TEXT     -- ISO date when superseded (NULL = current)
);

CREATE INDEX idx_provision_versions_doc_ref
  ON legal_provision_versions(document_id, provision_ref);
CREATE INDEX idx_provision_versions_window
  ON legal_provision_versions(valid_from, valid_to);
```

**Observation**: The schema already supports versioning! The `legal_provision_versions` table has 16,980 version records. However:
- Most records have `valid_from` but `valid_to = NULL`
- No explicit amendment tracking (which SFS amended which provision)
- No diff/changelog metadata

## Enhanced Schema: Amendment Tracking Table

To enable **amendment chain queries** and **change attribution**, add:

```sql
-- Amendment tracking: explicit record of each statutory change
CREATE TABLE statute_amendments (
  id INTEGER PRIMARY KEY,

  -- Target statute being amended
  target_document_id TEXT NOT NULL REFERENCES legal_documents(id),
  target_provision_ref TEXT,  -- NULL = entire statute affected

  -- Amending statute
  amended_by_sfs TEXT NOT NULL,  -- SFS number, e.g., "2021:1174"
  amendment_date TEXT NOT NULL,   -- ISO date: when amendment took effect

  -- Type of amendment
  amendment_type TEXT NOT NULL
    CHECK(amendment_type IN ('ändrad', 'ny_lydelse', 'införd', 'upphävd', 'ikraftträdande')),

  -- Version linkage
  version_before_id INTEGER REFERENCES legal_provision_versions(id),
  version_after_id INTEGER REFERENCES legal_provision_versions(id),

  -- Change metadata
  change_summary TEXT,  -- Brief description: "Changed reference from 1998:204 to 2018:218"
  amendment_section TEXT,  -- Section in amending statute, e.g., "3 §" in SFS 2021:1174

  UNIQUE(target_document_id, target_provision_ref, amended_by_sfs, amendment_date)
);

CREATE INDEX idx_amendments_target
  ON statute_amendments(target_document_id, target_provision_ref);
CREATE INDEX idx_amendments_date
  ON statute_amendments(amendment_date);
CREATE INDEX idx_amendments_amending_sfs
  ON statute_amendments(amended_by_sfs);

-- FTS5 index for searching amendment summaries
CREATE VIRTUAL TABLE amendments_fts USING fts5(
  change_summary, amendment_section,
  content='statute_amendments',
  content_rowid='id'
);
```

### Amendment Type Taxonomy

| Type | Swedish | Description | Example |
|------|---------|-------------|---------|
| `ändrad` | Ändrad | Provision text modified | DSL 1:3 modified by 2021:1174 |
| `ny_lydelse` | Ny lydelse | Complete replacement | Provision rewritten entirely |
| `införd` | Införd genom | New provision added | New section inserted mid-statute |
| `upphävd` | Upphävd | Provision repealed | Deleted provision |
| `ikraftträdande` | Ikraftträdande | Delayed effectiveness | Transitional rules |

## Storage Strategy: Full Copy vs Diffs

### Option A: Full Copy (RECOMMENDED)
**Store complete provision text for each version**

Pros:
- Simple queries: `SELECT content WHERE valid_from <= date`
- No reconstruction needed
- Text search works directly on historical versions
- Already implemented in `legal_provision_versions`

Cons:
- Higher storage (but SQLite compression mitigates)
- Current: 16,980 versions × ~500 bytes avg = ~8.5 MB (negligible)

### Option B: Delta Storage
**Store diffs between versions**

Pros:
- Lower storage for large, frequently-amended statutes

Cons:
- Complex reconstruction logic
- Breaks full-text search on history
- Must traverse amendment chain for queries
- Not worth complexity for Swedish law corpus size

**Decision**: Continue with **full copy** approach. Swedish legal corpus is small enough (~100-500 statutes × ~10 versions avg = ~50,000 records = ~25 MB total).

## Time-Travel Query Design

### Query 1: Get provision text as of specific date

```sql
-- Get DSL 3:5 as it read on 2020-01-01
SELECT content, valid_from, valid_to
FROM legal_provision_versions
WHERE document_id = '2018:218'
  AND provision_ref = '3:5'
  AND (valid_from IS NULL OR valid_from <= '2020-01-01')
  AND (valid_to IS NULL OR valid_to > '2020-01-01')
ORDER BY valid_from DESC
LIMIT 1;
```

### Query 2: Show amendment chain

```sql
-- Show all amendments to DSL 1:3
SELECT
  sa.amendment_date,
  sa.amended_by_sfs,
  sa.amendment_type,
  sa.change_summary,
  vprev.content as content_before,
  vnext.content as content_after
FROM statute_amendments sa
LEFT JOIN legal_provision_versions vprev ON sa.version_before_id = vprev.id
LEFT JOIN legal_provision_versions vnext ON sa.version_after_id = vnext.id
WHERE sa.target_document_id = '2018:218'
  AND sa.target_provision_ref = '1:3'
ORDER BY sa.amendment_date;
```

### Query 3: Find all statutes amended in given year

```sql
SELECT
  ld.title,
  ld.short_name,
  COUNT(*) as amendment_count,
  GROUP_CONCAT(DISTINCT sa.amended_by_sfs) as amended_by
FROM statute_amendments sa
JOIN legal_documents ld ON sa.target_document_id = ld.id
WHERE sa.amendment_date LIKE '2021%'
GROUP BY sa.target_document_id
ORDER BY amendment_count DESC;
```

### Query 4: Diff between two dates

```sql
-- Show what changed in DSL between 2020-01-01 and 2023-01-01
SELECT
  v1.provision_ref,
  v1.content as content_2020,
  v2.content as content_2023,
  sa.amendment_date,
  sa.amended_by_sfs,
  sa.change_summary
FROM legal_provision_versions v1
JOIN legal_provision_versions v2
  ON v1.document_id = v2.document_id
  AND v1.provision_ref = v2.provision_ref
LEFT JOIN statute_amendments sa
  ON sa.target_document_id = v1.document_id
  AND sa.target_provision_ref = v1.provision_ref
  AND sa.amendment_date BETWEEN '2020-01-01' AND '2023-01-01'
WHERE v1.document_id = '2018:218'
  AND v1.valid_from <= '2020-01-01'
  AND (v1.valid_to IS NULL OR v1.valid_to > '2020-01-01')
  AND v2.valid_from <= '2023-01-01'
  AND (v2.valid_to IS NULL OR v2.valid_to > '2023-01-01')
  AND v1.content != v2.content;
```

## Implementation Strategy

### Phase 1: Enhance Existing Data (No Schema Changes Needed)
1. Populate `valid_to` dates in existing `legal_provision_versions` records
2. Parse amendment references from provision text: `Lag (YYYY:NNN)`
3. Create cross-references with `ref_type='amended_by'`

### Phase 2: Add Amendment Tracking Table
1. Run migration to add `statute_amendments` table
2. Backfill from existing data:
   - Extract `Lag (YYYY:NNN)` citations
   - Match to version records
   - Create amendment records

### Phase 3: Ingestion Pipeline Updates
1. When ingesting amending statute:
   - Parse "Ändringar i lag (YYYY:NNN)" sections
   - Extract provision changes
   - Create new version records
   - Link with amendment records
2. Update `valid_to` dates of superseded versions

### Phase 4: MCP Tools
1. `get_provision_at_date(sfs, provision, date)` - time-travel query
2. `get_amendment_history(sfs, provision)` - show change log
3. `diff_provisions(sfs, provision, date1, date2)` - compare versions
4. Update `search_legislation` to support date filters

## Data Quality Considerations

### Challenges

1. **Riksdagen consolidation**: API returns only current text
   - Need to parse amending statutes to extract old text
   - Some amendments may be in older SFS not digitized

2. **Retroactive changes**: Some amendments apply retroactively
   - Must capture both "amendment date" and "effective date"

3. **Transitional rules**: Gradual phase-ins
   - Example: "Takes effect 2023-01-01 for new cases, 2024-01-01 for existing"
   - May need multiple version records per provision

4. **Missing historical text**: Pre-digital era statutes
   - Riksdagen API coverage: ~1990s onward for full text
   - Earlier statutes may only have consolidated current text

### Data Verification

For each amendment record:
- ✅ `amended_by_sfs` must exist as `legal_document` with `type='statute'`
- ✅ `amendment_date` must be >= `target_document.issued_date`
- ✅ `version_before_id` must have `valid_to = amendment_date`
- ✅ `version_after_id` must have `valid_from = amendment_date`
- ✅ Text diff should be non-empty (unless pure metadata change)

## Alternative Data Sources

If Riksdagen lacks historical text:

1. **Lagrummet.se**: Government legal database
   - May have archived versions
   - No public API (scraping required)

2. **lagen.nu**: Third-party legal database
   - CC-BY licensed
   - Focus on case law, limited statute versioning

3. **SFS print archive**: National Library
   - Physical/PDF copies of original SFS publications
   - Would require OCR for digitization

4. **Reconstructive approach**: Work backwards from amendments
   - Parse amending statute text: "5 § ska ha följande lydelse"
   - Extract replacement text from amending document
   - Requires sophisticated NLP for Swedish legal language
