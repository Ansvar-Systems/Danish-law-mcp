# MCP Tool Specification: get_provision_at_date

## Overview

**Tool Name**: `get_provision_at_date`
**Purpose**: Time-travel queries for Swedish statute provisions
**Category**: Historical Legal Research

Retrieve the exact text of a statute provision as it read on a specific date in history, accounting for all amendments since original enactment.

## Use Cases

1. **Historical Legal Research**
   - "What did Dataskyddslagen 3:5 say in 2019 before the 2021 amendment?"
   - "Show me how Brottsbalken 3:1 (murder) was worded in 1970"

2. **Amendment Impact Analysis**
   - "When did this provision change?"
   - "What was the legal situation on the date of this case/contract?"

3. **Legislative History**
   - "Has this provision been amended since enactment?"
   - "Show me all versions of this provision over time"

4. **Compliance Verification**
   - "Was our 2020 policy compliant with the law at that time?"
   - "What were the data retention rules on 2018-05-25 (GDPR effective date)?"

## Parameters

```typescript
interface GetProvisionAtDateParams {
  sfs: string;              // Required: SFS number, e.g., "2018:218"
  provision_ref: string;     // Required: e.g., "1:3" (chaptered) or "5" (flat)
  date: string;              // Required: ISO date "YYYY-MM-DD"
  include_amendments?: boolean; // Optional: include post-date amendments (default: false)
}
```

### Parameter Details

| Parameter | Type | Required | Format | Example | Description |
|-----------|------|----------|--------|---------|-------------|
| `sfs` | string | Yes | `YYYY:NNN` | `"2018:218"` | SFS number identifying the statute |
| `provision_ref` | string | Yes | `C:S` or `S` | `"1:3"` or `"5"` | Provision reference (chapter:section or section) |
| `date` | string | Yes | `YYYY-MM-DD` | `"2020-06-15"` | ISO 8601 date for query |
| `include_amendments` | boolean | No | - | `true` | Whether to include amendment history after this date |

### Validation Rules

- **sfs**: Must match pattern `^\d{4}:\d+$` (e.g., 2018:218)
- **provision_ref**: Must match statute structure (validated against database)
- **date**: Must be valid ISO date between 1900-01-01 and today
- **include_amendments**: Boolean, defaults to `false`

## Return Value

```typescript
interface ProvisionVersion {
  provision_ref: string;     // e.g., "1:3"
  chapter?: string;          // e.g., "1" (if chaptered statute)
  section: string;           // e.g., "3"
  title?: string;            // Provision heading (if present)
  content: string;           // Full provision text as of date
  valid_from: string | null; // ISO date when this version became effective
  valid_to: string | null;   // ISO date when superseded (null = current)
  status: 'current' | 'historical' | 'future' | 'not_found';
  amendments?: AmendmentRecord[]; // If include_amendments = true
}

interface AmendmentRecord {
  amended_by_sfs: string;    // SFS number of amending statute
  amendment_date: string;    // ISO date amendment took effect
  amendment_type: string;    // e.g., "ändrad", "ny_lydelse", "upphävd"
  change_summary?: string;   // Human-readable summary of change
}
```

### Status Values

| Status | Description | Example Scenario |
|--------|-------------|------------------|
| `current` | This version is still in force | Querying today's date |
| `historical` | This version has been superseded | Querying 2020 for provision amended in 2021 |
| `future` | Provision enacted but not yet in force on queried date | Querying 2018-01-01 for provision in force 2018-05-25 |
| `not_found` | Provision does not exist in this statute | Invalid provision reference |

## SQL Query Logic

### Core Query

```sql
SELECT
  provision_ref,
  chapter,
  section,
  title,
  content,
  valid_from,
  valid_to
FROM legal_provision_versions
WHERE document_id = ?              -- sfs parameter
  AND provision_ref = ?            -- provision_ref parameter
  AND (valid_from IS NULL OR valid_from <= ?) -- date parameter
  AND (valid_to IS NULL OR valid_to > ?)      -- date parameter
ORDER BY valid_from DESC
LIMIT 1;
```

### Logic Explanation

**Date window matching**:
- `valid_from <= date`: Version was in effect on or before queried date
- `valid_to > date` OR `valid_to IS NULL`: Version was not yet superseded on queried date
- `ORDER BY valid_from DESC`: Get most recent version on or before date
- `LIMIT 1`: Return single matching version

**NULL handling**:
- `valid_from IS NULL`: Original enactment (use statute's `issued_date`)
- `valid_to IS NULL`: Current version (not yet superseded)

### Amendment History Query (Optional)

If `include_amendments = true`:

```sql
SELECT
  amended_by_sfs,
  amendment_date,
  amendment_type,
  change_summary
FROM statute_amendments
WHERE target_document_id = ?      -- sfs parameter
  AND target_provision_ref = ?    -- provision_ref parameter
  AND amendment_date > ?          -- version's valid_from
ORDER BY amendment_date;
```

Returns all amendments that occurred **after** the queried date.

## Examples

### Example 1: Basic Historical Query

**Request**:
```json
{
  "sfs": "2018:218",
  "provision_ref": "1:3",
  "date": "2020-01-01"
}
```

**Response**:
```json
{
  "provision_ref": "1:3",
  "chapter": "1",
  "section": "3",
  "content": "Bestämmelserna i 2 § gäller inte i verksamhet som omfattas av lagen (2019:1182) om Säkerhetspolisens behandling av personuppgifter.",
  "valid_from": "2018-05-25",
  "valid_to": "2021-12-01",
  "status": "historical"
}
```

**Interpretation**: On 2020-01-01, DSL 1:3 had its original text (before 2021:1174 amendment added Defense Agency exemptions).

### Example 2: Current Version Query

**Request**:
```json
{
  "sfs": "2018:218",
  "provision_ref": "1:3",
  "date": "2024-01-01"
}
```

**Response**:
```json
{
  "provision_ref": "1:3",
  "chapter": "1",
  "section": "3",
  "content": "Bestämmelserna i 2 § gäller inte i verksamhet som omfattas av 1. lagen (2021:1171) om behandling av personuppgifter vid Försvarsmakten, 2. lagen (2021:1172) om behandling av personuppgifter vid Försvarets radioanstalt, eller 3. lagen (2019:1182) om Säkerhetspolisens behandling av personuppgifter. Lag (2021:1174).",
  "valid_from": "2021-12-01",
  "valid_to": null,
  "status": "current"
}
```

**Interpretation**: This is the current text (amended by 2021:1174), valid from 2021-12-01 onward.

### Example 3: With Amendment History

**Request**:
```json
{
  "sfs": "2018:218",
  "provision_ref": "1:3",
  "date": "2020-01-01",
  "include_amendments": true
}
```

**Response**:
```json
{
  "provision_ref": "1:3",
  "chapter": "1",
  "section": "3",
  "content": "Bestämmelserna i 2 § gäller inte...",
  "valid_from": "2018-05-25",
  "valid_to": "2021-12-01",
  "status": "historical",
  "amendments": [
    {
      "amended_by_sfs": "2021:1174",
      "amendment_date": "2021-12-01",
      "amendment_type": "ändrad",
      "change_summary": "Added exemptions for Defense Agency (1171) and Radio Agency (1172)"
    }
  ]
}
```

**Interpretation**: Shows the 2020 text AND that it was later amended in 2021.

### Example 4: Future Provision (Not Yet In Force)

**Request**:
```json
{
  "sfs": "2018:218",
  "provision_ref": "1:3",
  "date": "2018-01-01"
}
```

**Response**:
```json
{
  "provision_ref": "1:3",
  "chapter": "1",
  "section": "3",
  "content": "",
  "valid_from": "2018-05-25",
  "valid_to": null,
  "status": "future"
}
```

**Interpretation**: DSL was enacted 2018-04-19 but didn't take effect until 2018-05-25 (GDPR effective date). On 2018-01-01, the provision existed but was not yet in force.

### Example 5: Non-Existent Provision

**Request**:
```json
{
  "sfs": "2018:218",
  "provision_ref": "99:99",
  "date": "2020-01-01"
}
```

**Response**:
```json
{
  "provision_ref": "99:99",
  "section": "99",
  "content": "",
  "valid_from": null,
  "valid_to": null,
  "status": "not_found"
}
```

**Interpretation**: No provision "99:99" exists in Dataskyddslagen.

## Error Handling

### Error Scenarios

| Error Type | HTTP Code | Condition | Example |
|------------|-----------|-----------|---------|
| `InvalidDateError` | 400 | Date format invalid | `"2020-13-45"` (bad month/day) |
| `InvalidSfsError` | 400 | SFS format invalid | `"2018-218"` (dash instead of colon) |
| `StatuteNotFoundError` | 404 | Statute doesn't exist | `"9999:999"` |
| `ProvisionNotFoundError` | 404 | Provision doesn't exist | `"99:99"` in DSL |
| `DatabaseError` | 500 | Database query failed | Connection timeout |

### Error Response Format

```json
{
  "error": {
    "type": "InvalidDateError",
    "message": "Invalid date format: 2020-13-45. Expected YYYY-MM-DD.",
    "details": {
      "parameter": "date",
      "provided": "2020-13-45",
      "expected": "YYYY-MM-DD"
    }
  }
}
```

## Performance Considerations

### Query Optimization

**Indexes required**:
```sql
CREATE INDEX idx_provision_versions_doc_ref
  ON legal_provision_versions(document_id, provision_ref);

CREATE INDEX idx_provision_versions_window
  ON legal_provision_versions(valid_from, valid_to);
```

**Query complexity**: O(log n) for indexed lookup
**Expected latency**: <10ms for single provision

### Caching Strategy

- Cache current versions (most common query)
- Cache statutory effective dates (for future provision checks)
- No caching for historical queries (infrequent, low volume)

## Integration with Other Tools

### Related Tools

| Tool | Relationship | Use Together |
|------|--------------|--------------|
| `get_provision` | Complement | Use `get_provision` for current text, `get_provision_at_date` for historical |
| `get_amendment_history` | Related | Shows **what changed**; this tool shows **text at date** |
| `diff_provisions` | Extends | Compare text between two dates using this tool twice |
| `search_legislation` | Filter | Search current, then use this for historical verification |

### Workflow Example

```typescript
// 1. Search for provisions about "data breach reporting"
const provisions = searchLegislation({ query: "dataintrång rapportering" });

// 2. For each result, check historical version on specific date
for (const provision of provisions) {
  const historicalVersion = getProvisionAtDate({
    sfs: provision.document_id,
    provision_ref: provision.provision_ref,
    date: "2020-01-01"
  });

  // 3. Compare with current
  const currentVersion = getProvision({
    sfs: provision.document_id,
    provision_ref: provision.provision_ref
  });

  if (historicalVersion.content !== currentVersion.content) {
    console.log(`${provision.provision_ref} was amended!`);
  }
}
```

## Implementation Notes

### Database Schema Requirements

Requires:
- ✅ `legal_provision_versions` table (already exists)
- ✅ `statute_amendments` table (new, to be added)
- ✅ `valid_from` and `valid_to` date columns populated

### Data Quality Dependencies

Tool accuracy depends on:
1. **Complete version records**: All historical versions must be in database
2. **Accurate dates**: `valid_from` and `valid_to` must be correct
3. **Amendment linkage**: `statute_amendments` table must reference correct versions

### Known Limitations

1. **Pre-digital statutes**: Historical text may be incomplete for statutes enacted before Riksdagen digitization (~1990s)
2. **Transitional rules**: Complex phase-in schedules may require multiple version records per provision
3. **Retroactive amendments**: Effective date may differ from amendment date
4. **Consolidated text**: Riksdagen API returns consolidated text; historical reconstruction requires parsing amending statutes

## Testing Strategy

### Unit Tests

```typescript
describe('get_provision_at_date', () => {
  it('should return historical version before amendment', () => {
    const result = getProvisionAtDate(db, {
      sfs: '2018:218',
      provision_ref: '1:3',
      date: '2020-01-01'
    });
    expect(result.status).toBe('historical');
    expect(result.content).not.toContain('2021:1171'); // Defense exemption not yet added
  });

  it('should return current version for recent date', () => {
    const result = getProvisionAtDate(db, {
      sfs: '2018:218',
      provision_ref: '1:3',
      date: '2024-01-01'
    });
    expect(result.status).toBe('current');
    expect(result.content).toContain('2021:1171'); // Defense exemption present
  });

  it('should return future status for pre-enactment date', () => {
    const result = getProvisionAtDate(db, {
      sfs: '2018:218',
      provision_ref: '1:3',
      date: '2018-01-01'
    });
    expect(result.status).toBe('future');
  });

  it('should return not_found for non-existent provision', () => {
    const result = getProvisionAtDate(db, {
      sfs: '2018:218',
      provision_ref: '99:99',
      date: '2020-01-01'
    });
    expect(result.status).toBe('not_found');
  });
});
```

### Integration Tests

Test with known amendment cases:
- DSL 1:3 (amended 2021:1174)
- BrB 3:1 (murder - amended 2019:805 to allow life imprisonment)
- OSL (multiple amendments, complex history)

### Edge Cases

1. **Provision enacted mid-year**: Check dates before/after enactment
2. **Multiple amendments same year**: Verify correct version selection
3. **Repealed provision**: Query date after repeal should return last version
4. **Inserted provision**: "5 a §" introduced between 5 and 6

## Documentation for Users

### User-Facing Description

> **Time-travel queries for Swedish statutes**
>
> See how any statute provision was worded at a specific date in history. Useful for:
> - Legal research: "What was the law on the date of this case?"
> - Compliance: "Was our 2020 policy compliant at that time?"
> - Legislative history: "When did this provision change?"
>
> Example: `get_provision_at_date("2018:218", "1:3", "2020-06-15")`

### Common Queries

| Question | Tool Call |
|----------|-----------|
| "What did DSL 3:5 say in 2019?" | `get_provision_at_date("2018:218", "3:5", "2019-12-31")` |
| "Show me current text" | `get_provision_at_date("2018:218", "3:5", "2024-02-12")` |
| "Was this in force on GDPR day?" | `get_provision_at_date("2018:218", "1:1", "2018-05-25")` |
| "Compare 2020 vs 2023" | Call twice with `date: "2020-01-01"` and `"2023-01-01"` |
