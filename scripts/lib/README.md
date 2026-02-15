# Scripts Library

Shared utilities for Swedish Law MCP ingestion scripts.

## lagennu-parser.ts

Shared functions for parsing lagen.nu case law data.

**Used by:**
- `scripts/ingest-lagennu-cases.ts` - Initial full ingestion
- `scripts/sync-lagennu-cases.ts` - Incremental sync updates

**Exports:**

### Types
- `CaseId` - Parsed case identifier (court, year, number)
- `CaseMetadata` - Complete case metadata from RDF
- `InsertResult` - Database operation result

### Constants
- `FEED_URL` - lagen.nu HTML feed URL
- `RDF_BASE_URL` - Base URL for RDF documents
- `REQUEST_DELAY_MS` - Rate limiting delay
- `MAX_RETRIES` - Network retry attempts
- `USER_AGENT` - HTTP user agent string

### Functions

#### Network
- `delay(ms)` - Promise-based delay
- `fetchWithRetry(url, retries?)` - Fetch with exponential backoff

#### Parsing
- `parseCaseId(caseIdStr)` - Parse case ID string to components
- `fetchCaseIdsFromFeed()` - Fetch all case IDs from HTML feed
- `parseRdfMetadata(rdf, caseId)` - Extract metadata from RDF/XML
- `extractDecisionDateFromCaseId(caseId)` - Get decision date fallback

#### URLs
- `caseIdToRdfUrl(caseId)` - Convert case ID to RDF URL
- `caseIdToDocumentId(caseId)` - Generate database document ID

#### Database
- `insertOrUpdateCase(db, metadata, insertDoc, insertCase)` - Upsert case
- `fetchCaseRdf(caseId)` - Fetch RDF for a case

## Code Reuse Pattern

Extract common functionality here to avoid duplication:

```typescript
// Before (duplicated code)
// ingest-lagennu-cases.ts: parseCaseId() { ... }
// sync-lagennu-cases.ts: parseCaseId() { ... }

// After (shared code)
// lib/lagennu-parser.ts: export function parseCaseId() { ... }
// ingest-lagennu-cases.ts: import { parseCaseId } from './lib/lagennu-parser.js';
// sync-lagennu-cases.ts: import { parseCaseId } from './lib/lagennu-parser.js';
```

## Testing

Test the parser functions:

```bash
npx tsx scripts/test-lagennu-parser.ts
```
