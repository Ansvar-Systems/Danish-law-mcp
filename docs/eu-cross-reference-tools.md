# EU Cross-Reference MCP Tools

## Overview

This document specifies MCP tools for querying EU law cross-references in Swedish legislation. These tools enable bi-directional lookup between Swedish statutes and EU directives/regulations.

## Tool 1: `get_eu_basis`

### Purpose
Retrieve the EU legal basis (directives and regulations) for a Swedish statute.

### Input Parameters

```typescript
interface GetEUBasisParams {
  sfs_number: string;          // SFS number (e.g., "2018:218")
  include_articles?: boolean;   // Include specific article references
  reference_types?: string[];   // Filter by reference type
}
```

### Output

```typescript
interface EUBasisResult {
  sfs_number: string;
  sfs_title: string;
  eu_documents: Array<{
    id: string;                    // "directive:2016/679"
    type: "directive" | "regulation";
    year: number;
    number: number;
    community: "EU" | "EG" | "EEG" | "Euratom";
    celex_number: string;          // "32016R0679"
    title?: string;
    short_name?: string;           // "GDPR"
    reference_type: ReferenceType;
    is_primary_implementation: boolean;
    articles?: string[];           // ["6.1.c", "13-15"]
    url_eur_lex?: string;
  }>;
  statistics: {
    total_eu_references: number;
    directive_count: number;
    regulation_count: number;
  };
}
```

### Example Usage

```typescript
// Get EU basis for Dataskyddslagen (DSL)
const result = await get_eu_basis({
  sfs_number: "2018:218",
  include_articles: true
});

// Result:
{
  "sfs_number": "2018:218",
  "sfs_title": "Lag med kompletterande bestämmelser till EU:s dataskyddsförordning",
  "eu_documents": [
    {
      "id": "regulation:2016/679",
      "type": "regulation",
      "year": 2016,
      "number": 679,
      "community": "EU",
      "celex_number": "32016R0679",
      "title": "General Data Protection Regulation",
      "short_name": "GDPR",
      "reference_type": "supplements",
      "is_primary_implementation": true,
      "articles": ["6.1.c", "6.1.e", "9.2", "13-15", "33", "34", "83"],
      "url_eur_lex": "https://eur-lex.europa.eu/eli/reg/2016/679/oj"
    },
    {
      "id": "directive:1995/46",
      "type": "directive",
      "year": 1995,
      "number": 46,
      "community": "EG",
      "short_name": "Data Protection Directive",
      "reference_type": "references",
      "is_primary_implementation": false
    }
  ],
  "statistics": {
    "total_eu_references": 2,
    "directive_count": 1,
    "regulation_count": 1
  }
}
```

### SQL Implementation

```sql
SELECT
  ld.id AS sfs_number,
  ld.title AS sfs_title,
  ed.id,
  ed.type,
  ed.year,
  ed.number,
  ed.community,
  ed.celex_number,
  ed.title,
  ed.short_name,
  ed.url_eur_lex,
  er.reference_type,
  er.is_primary_implementation,
  GROUP_CONCAT(DISTINCT er.eu_article) AS articles
FROM legal_documents ld
JOIN eu_references er ON ld.id = er.document_id
JOIN eu_documents ed ON er.eu_document_id = ed.id
WHERE ld.id = ?
GROUP BY ed.id
ORDER BY
  er.is_primary_implementation DESC,
  CASE er.reference_type
    WHEN 'implements' THEN 1
    WHEN 'supplements' THEN 2
    WHEN 'applies' THEN 3
    ELSE 4
  END,
  ed.year DESC;
```

## Tool 2: `get_swedish_implementations`

### Purpose
Find Swedish statutes that implement or reference a specific EU directive or regulation.

### Input Parameters

```typescript
interface GetSwedishImplementationsParams {
  eu_document_id: string;        // "directive:2016/680" or "regulation:2016/679"
  primary_only?: boolean;        // Only return primary implementing statutes
  in_force_only?: boolean;       // Only return in-force statutes
}
```

### Output

```typescript
interface SwedishImplementationsResult {
  eu_document: {
    id: string;
    type: "directive" | "regulation";
    year: number;
    number: number;
    title?: string;
    short_name?: string;
    celex_number: string;
  };
  implementations: Array<{
    sfs_number: string;
    sfs_title: string;
    short_name?: string;
    status: "in_force" | "amended" | "repealed";
    reference_type: ReferenceType;
    is_primary_implementation: boolean;
    implementation_status?: "complete" | "partial" | "pending" | "unknown";
    articles_referenced?: string[];
  }>;
  statistics: {
    total_statutes: number;
    primary_implementations: number;
    in_force: number;
    repealed: number;
  };
}
```

### Example Usage

```typescript
// Find Swedish implementations of GDPR
const result = await get_swedish_implementations({
  eu_document_id: "regulation:2016/679",
  in_force_only: true
});

// Result:
{
  "eu_document": {
    "id": "regulation:2016/679",
    "type": "regulation",
    "year": 2016,
    "number": 679,
    "title": "General Data Protection Regulation",
    "short_name": "GDPR",
    "celex_number": "32016R0679"
  },
  "implementations": [
    {
      "sfs_number": "2018:218",
      "sfs_title": "Dataskyddslagen",
      "short_name": "DSL",
      "status": "in_force",
      "reference_type": "supplements",
      "is_primary_implementation": true,
      "implementation_status": "complete",
      "articles_referenced": ["6.1.c", "6.1.e", "9.2", "13-15"]
    },
    {
      "sfs_number": "2009:400",
      "sfs_title": "Offentlighets- och sekretesslag",
      "short_name": "OSL",
      "status": "in_force",
      "reference_type": "applies",
      "is_primary_implementation": false
    }
  ],
  "statistics": {
    "total_statutes": 2,
    "primary_implementations": 1,
    "in_force": 2,
    "repealed": 0
  }
}
```

### SQL Implementation

```sql
SELECT
  ed.id,
  ed.type,
  ed.year,
  ed.number,
  ed.title,
  ed.short_name,
  ed.celex_number,
  ld.id AS sfs_number,
  ld.title AS sfs_title,
  ld.short_name AS sfs_short_name,
  ld.status,
  er.reference_type,
  er.is_primary_implementation,
  er.implementation_status,
  GROUP_CONCAT(DISTINCT er.eu_article) AS articles_referenced
FROM eu_documents ed
JOIN eu_references er ON ed.id = er.eu_document_id
JOIN legal_documents ld ON er.document_id = ld.id
WHERE ed.id = ?
  AND (? = 0 OR er.is_primary_implementation = 1)
  AND (? = 0 OR ld.status = 'in_force')
GROUP BY ld.id
ORDER BY er.is_primary_implementation DESC, ld.id;
```

## Tool 3: `search_eu_implementations`

### Purpose
Search for Swedish implementations of EU directives/regulations by keyword, year, or type.

### Input Parameters

```typescript
interface SearchEUImplementationsParams {
  query?: string;              // Keyword search (title, short_name)
  type?: "directive" | "regulation";
  year_from?: number;
  year_to?: number;
  community?: "EU" | "EG" | "EEG";
  has_swedish_implementation?: boolean;
  limit?: number;
}
```

### Output

```typescript
interface SearchEUImplementationsResult {
  results: Array<{
    eu_document: {
      id: string;
      type: "directive" | "regulation";
      year: number;
      number: number;
      title?: string;
      short_name?: string;
      community: string;
    };
    swedish_statute_count: number;
    primary_implementations: string[];  // SFS numbers
    all_references: string[];           // SFS numbers
  }>;
  total_results: number;
  query_info: SearchEUImplementationsParams;
}
```

## Tool 4: `get_provision_eu_basis`

### Purpose
Get EU law basis for a specific provision within a Swedish statute.

### Input Parameters

```typescript
interface GetProvisionEUBasisParams {
  sfs_number: string;
  provision_ref: string;       // e.g., "1:1" or "3:5"
}
```

### Output

```typescript
interface ProvisionEUBasisResult {
  sfs_number: string;
  provision_ref: string;
  provision_content: string;
  eu_references: Array<{
    id: string;
    type: "directive" | "regulation";
    title?: string;
    short_name?: string;
    article?: string;
    reference_type: ReferenceType;
    full_citation: string;
    context: string;
  }>;
}
```

### Example Usage

```typescript
// Get EU basis for DSL 2:1 (legal obligation ground)
const result = await get_provision_eu_basis({
  sfs_number: "2018:218",
  provision_ref: "2:1"
});

// Result shows this provision references GDPR Article 6.1.c
```

## Tool 5: `validate_eu_compliance`

### Purpose
Check if a Swedish provision correctly implements/references EU law (future: integrate with @ansvar/eu-regulations-mcp for full validation).

### Input Parameters

```typescript
interface ValidateEUComplianceParams {
  sfs_number: string;
  provision_ref?: string;
  eu_document_id?: string;     // Check specific EU document compliance
}
```

### Output

```typescript
interface EUComplianceResult {
  sfs_number: string;
  provision_ref?: string;
  compliance_status: "compliant" | "partial" | "unclear" | "not_applicable";
  eu_references_found: number;
  missing_implementations?: string[];  // EU requirements not found
  potential_conflicts?: Array<{
    eu_article: string;
    swedish_provision: string;
    issue: string;
  }>;
  recommendations?: string[];
}
```

## Integration with @ansvar/eu-regulations-mcp

### Phase 1: Cross-Reference Only (Current)
- Tools return EU document IDs and metadata
- No full EU text retrieval
- Swedish law → EU ID mapping only

### Phase 2: Full Text Integration (Future)
```typescript
// Combined query across both MCP servers
const swedishProvision = await swedish_law_mcp.get_provision({
  sfs_number: "2018:218",
  provision_ref: "2:1"
});

const euBasis = await swedish_law_mcp.get_provision_eu_basis({
  sfs_number: "2018:218",
  provision_ref: "2:1"
});

// For each EU reference, fetch full text
for (const euRef of euBasis.eu_references) {
  const euText = await eu_regulations_mcp.get_article({
    regulation_id: euRef.id,
    article: euRef.article
  });

  // Compare Swedish implementation with EU requirement
  // ...
}
```

### Phase 3: Compliance Checking (Future)
- Automated comparison of Swedish provisions with EU requirements
- Detect missing implementations
- Flag potential conflicts
- Track implementation deadlines

## Database Views for Tool Support

### View: EU Implementation Coverage
```sql
CREATE VIEW v_eu_implementation_coverage AS
SELECT
  ed.id AS eu_document_id,
  ed.type,
  ed.year,
  ed.number,
  ed.title,
  COUNT(DISTINCT ld.id) AS swedish_statute_count,
  COUNT(DISTINCT CASE WHEN er.is_primary_implementation THEN ld.id END) AS primary_implementation_count,
  COUNT(DISTINCT CASE WHEN ld.status = 'in_force' THEN ld.id END) AS in_force_count,
  MAX(CASE WHEN er.is_primary_implementation THEN ld.id END) AS primary_sfs_number
FROM eu_documents ed
LEFT JOIN eu_references er ON ed.id = er.eu_document_id
LEFT JOIN legal_documents ld ON er.document_id = ld.id
GROUP BY ed.id;
```

### View: Swedish Statute EU Dependency
```sql
CREATE VIEW v_statute_eu_dependency AS
SELECT
  ld.id AS sfs_number,
  ld.title,
  COUNT(DISTINCT er.eu_document_id) AS eu_document_count,
  COUNT(DISTINCT CASE WHEN ed.type = 'directive' THEN ed.id END) AS directive_count,
  COUNT(DISTINCT CASE WHEN ed.type = 'regulation' THEN ed.id END) AS regulation_count,
  GROUP_CONCAT(DISTINCT CASE WHEN er.is_primary_implementation THEN ed.id END) AS primary_eu_basis
FROM legal_documents ld
LEFT JOIN eu_references er ON ld.id = er.document_id
LEFT JOIN eu_documents ed ON er.eu_document_id = ed.id
WHERE ld.type = 'statute'
GROUP BY ld.id;
```

## Error Handling

### Error: EU Document Not Found
```typescript
{
  "error": "eu_document_not_found",
  "message": "EU document 'directive:2099/999' not found in database",
  "suggestion": "Check the directive ID format (e.g., 'directive:2016/680')"
}
```

### Error: No Implementations Found
```typescript
{
  "error": "no_implementations_found",
  "message": "No Swedish implementations found for regulation:2016/679",
  "possible_reasons": [
    "The EU regulation may be directly applicable without Swedish implementing legislation",
    "The regulation may not yet be transposed into Swedish law",
    "The regulation may not be applicable to Sweden"
  ]
}
```

## Performance Considerations

1. **Indexing:** All queries use indexed columns (document_id, eu_document_id, provision_id)
2. **Caching:** EU document metadata can be cached (rarely changes)
3. **Lazy loading:** Article references loaded only when `include_articles=true`
4. **Batch queries:** Support fetching EU basis for multiple statutes in one call

## Future Enhancements

1. **EU directive deadline tracking:** Alert when implementation deadline is approaching
2. **Case law integration:** Link Swedish court decisions citing both Swedish and EU law
3. **Comparative implementation:** Compare Swedish implementation with other EU member states
4. **Amendment tracking:** Track EU directive amendments and corresponding Swedish updates
5. **Implementation reports:** Generate compliance reports for Swedish authorities
6. **EUR-Lex integration:** Fetch current EU law text directly from EUR-Lex API
