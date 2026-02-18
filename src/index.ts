#!/usr/bin/env node
/**
 * Danish Legal Citation MCP Server
 *
 * Provides 8 tools for querying Danish statutes, case law,
 * preparatory works, and legal citations.
 *
 * Zero-hallucination: never generates citations, only returns verified database entries.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { readFileSync, statSync } from 'fs';
import type { AboutContext } from './tools/about.js';

import { searchLegislation, SearchLegislationInput } from './tools/search-legislation.js';
import { getProvision, GetProvisionInput } from './tools/get-provision.js';
import { searchCaseLaw, SearchCaseLawInput } from './tools/search-case-law.js';
import { getPreparatoryWorks, GetPreparatoryWorksInput } from './tools/get-preparatory-works.js';
import { validateCitationTool, ValidateCitationInput } from './tools/validate-citation.js';
import { buildLegalStance, BuildLegalStanceInput } from './tools/build-legal-stance.js';
import { formatCitationTool, FormatCitationInput } from './tools/format-citation.js';
import { checkCurrency, CheckCurrencyInput } from './tools/check-currency.js';
import { getEUBasis, GetEUBasisInput } from './tools/get-eu-basis.js';
import { getDanishImplementations, GetDanishImplementationsInput } from './tools/get-danish-implementations.js';
import { searchEUImplementations, SearchEUImplementationsInput } from './tools/search-eu-implementations.js';
import { getProvisionEUBasis, GetProvisionEUBasisInput } from './tools/get-provision-eu-basis.js';
import { validateEUCompliance, ValidateEUComplianceInput } from './tools/validate-eu-compliance.js';
import { getAbout } from './tools/about.js';
import {
  detectCapabilities,
  readDbMetadata,
  type Capability,
  type DbMetadata,
} from './capabilities.js';

const SERVER_NAME = 'danish-legal-citations';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PKG_PATH = path.join(__dirname, '..', 'package.json');
const pkgVersion: string = JSON.parse(readFileSync(PKG_PATH, 'utf-8')).version;

const DB_ENV_VAR = 'DANISH_LAW_DB_PATH';
const DEFAULT_DB_PATH = '../data/database.db';

let dbInstance: InstanceType<typeof Database> | null = null;
let serverCapabilities: Set<Capability> | null = null;
let serverMetadata: DbMetadata | null = null;

function getDb(): InstanceType<typeof Database> {
  if (!dbInstance) {
    const dbPath = process.env[DB_ENV_VAR] || getDefaultDbPath();
    console.error(`[${SERVER_NAME}] Opening database: ${dbPath}`);
    dbInstance = new Database(dbPath, { readonly: true });
    dbInstance.pragma('foreign_keys = ON');
    console.error(`[${SERVER_NAME}] Database opened successfully`);

    // Detect capabilities on first open
    serverCapabilities = detectCapabilities(dbInstance);
    serverMetadata = readDbMetadata(dbInstance);
    console.error(`[${SERVER_NAME}] Tier: ${serverMetadata.tier}`);
    console.error(`[${SERVER_NAME}] Capabilities: ${[...serverCapabilities].join(', ')}`);
  }
  return dbInstance;
}

export function getCapabilities(): Set<Capability> {
  if (!serverCapabilities) {
    getDb(); // triggers detection
  }
  return serverCapabilities!;
}

export function getMetadata(): DbMetadata {
  if (!serverMetadata) {
    getDb(); // triggers detection
  }
  return serverMetadata!;
}

function getDefaultDbPath(): string {
  return path.resolve(__dirname, DEFAULT_DB_PATH);
}

function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.error(`[${SERVER_NAME}] Database closed`);
  }
}

function computeAboutContext(): AboutContext {
  let fingerprint = 'unknown';
  let dbBuilt = new Date().toISOString();
  try {
    const dbPath = process.env[DB_ENV_VAR] || getDefaultDbPath();
    const dbBuffer = readFileSync(dbPath);
    fingerprint = createHash('sha256').update(dbBuffer).digest('hex').slice(0, 12);
    const dbStat = statSync(dbPath);
    dbBuilt = dbStat.mtime.toISOString();
  } catch {
    // Non-fatal
  }
  return { version: pkgVersion, fingerprint, dbBuilt };
}

const aboutContext = computeAboutContext();

const TOOLS: Tool[] = [
  {
    name: 'search_legislation',
    description: `Search Danish statutes and regulations by keyword.

Searches provision text using FTS5 with BM25 ranking. Supports boolean operators (AND, OR, NOT), phrase search ("exact phrase"), and prefix matching (term*).

Returns matched provisions with snippets, relevance scores, and document metadata.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query in Danish or English. Supports FTS5 syntax.',
        },
        document_id: {
          type: 'string',
          description: 'Filter to a specific statute by document ID (e.g., "2018:218")',
        },
        status: {
          type: 'string',
          enum: ['in_force', 'amended', 'repealed'],
          description: 'Filter by document status',
        },
        as_of_date: {
          type: 'string',
          description: 'Optional historical date filter (YYYY-MM-DD). Returns versions valid on that date.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 10, max: 50)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_provision',
    description: `Retrieve a specific provision from a Danish statute.

Specify the document ID and either chapter+section or provision_ref directly.
Examples:
  - document_id="2018:218", chapter="1", section="1" → 1 kap. 1 § DSL
  - document_id="2018:218", provision_ref="1:1" → same result
  - document_id="1998:204", section="5 a" → 5 a § PUL (flat statute, no chapter)

Omit chapter/section/provision_ref to get all provisions in the statute.`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'document ID (e.g., "2018:218")',
        },
        chapter: {
          type: 'string',
          description: 'Chapter number (e.g., "3"). Omit for flat statutes.',
        },
        section: {
          type: 'string',
          description: 'Section number (e.g., "5", "5 a")',
        },
        provision_ref: {
          type: 'string',
          description: 'Direct provision reference (e.g., "3:5" for Kap 3 § 5)',
        },
        as_of_date: {
          type: 'string',
          description: 'Optional historical date (YYYY-MM-DD). Returns the provision text valid on that date.',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'search_case_law',
    description: `Search Danish court decisions (retspraksis).

Searches case summaries and keywords. Filter by court and date range.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for case law summaries',
        },
        court: {
          type: 'string',
          description: 'Filter by court',
        },
        date_from: {
          type: 'string',
          description: 'Start date filter (ISO 8601, e.g., "2020-01-01")',
        },
        date_to: {
          type: 'string',
          description: 'End date filter (ISO 8601)',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 10, max: 50)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_preparatory_works',
    description: `Get preparatory works (forarbejder) for a Danish statute.

Returns linked preparatory documents with summaries.
Essential for understanding legislative intent behind statutory provisions.`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'document ID of the statute (e.g., "2018:218")',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'validate_citation',
    description: `Validate a Danish legal citation against the database.

Parses the citation, checks that the document and provision exist, and returns warnings about status (repealed, amended). This is the zero-hallucination enforcer.

Supported formats:
  - "document 2018:218 1 kap. 1 §"
  - "2018:218 1:1"
  - "Prop. 2017/18:105"
  - "SOU 2017:39"
  - "NJA 2020 s. 45"`,
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'Citation string to validate',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'build_legal_stance',
    description: `Build a comprehensive set of citations for a legal question.

Searches across statutes, case law, and preparatory works simultaneously to aggregate relevant citations. Use this for broad legal research questions.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Legal question or topic to research',
        },
        document_id: {
          type: 'string',
          description: 'Optionally limit statute search to one document',
        },
        include_case_law: {
          type: 'boolean',
          description: 'Include case law results (default: true)',
        },
        include_preparatory_works: {
          type: 'boolean',
          description: 'Include preparatory works results (default: true)',
        },
        as_of_date: {
          type: 'string',
          description: 'Optional historical date (YYYY-MM-DD) for time-aware retrieval.',
        },
        limit: {
          type: 'number',
          description: 'Max results per category (default: 5, max: 20)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'format_citation',
    description: `Format a Danish legal citation per standard conventions.

Formats:
  - full: "document 2018:218 3 kap. 5 §"
  - short: "2018:218 3:5"
  - pinpoint: "3 kap. 5 §"`,
    inputSchema: {
      type: 'object',
      properties: {
        citation: {
          type: 'string',
          description: 'Citation string to format',
        },
        format: {
          type: 'string',
          enum: ['full', 'short', 'pinpoint'],
          description: 'Output format (default: "full")',
        },
      },
      required: ['citation'],
    },
  },
  {
    name: 'check_currency',
    description: `Check if a Danish statute or provision is in force (current or historical).

Returns the document's status (in_force, amended, repealed, not_yet_in_force), dates, and warnings. Provide as_of_date for historical evaluation.`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'document ID (e.g., "2018:218")',
        },
        provision_ref: {
          type: 'string',
          description: 'Optional provision reference to check (e.g., "3:5")',
        },
        as_of_date: {
          type: 'string',
          description: 'Optional historical date (YYYY-MM-DD). Computes in-force status as of that date.',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_eu_basis',
    description: `Get EU legal basis (directives and regulations) for a Danish statute.

Returns all EU directives and regulations that this statute implements, supplements, or references. Includes reference types, article citations, and whether each EU document is a primary implementation.

Essential for understanding which EU law a Danish statute is based on.`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'document ID (e.g., "2018:218")',
        },
        include_articles: {
          type: 'boolean',
          description: 'Include specific EU article references (default: false)',
        },
        reference_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by reference type (implements, supplements, applies, etc.)',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_danish_implementations',
    description: `Find Danish statutes implementing a specific EU directive or regulation.

Given an EU document ID (e.g., "regulation:2016/679" for GDPR), returns all Danish statutes that implement, supplement, or reference it. Shows implementation status and which articles are referenced.

Essential for finding Danish law corresponding to EU requirements.`,
    inputSchema: {
      type: 'object',
      properties: {
        eu_document_id: {
          type: 'string',
          description: 'EU document ID (e.g., "regulation:2016/679", "directive:95/46")',
        },
        primary_only: {
          type: 'boolean',
          description: 'Return only primary implementing statutes (default: false)',
        },
        in_force_only: {
          type: 'boolean',
          description: 'Return only in-force statutes (default: false)',
        },
      },
      required: ['eu_document_id'],
    },
  },
  {
    name: 'search_eu_implementations',
    description: `Search for EU directives and regulations with Danish implementation information.

Search by keyword, type, year range, or community. Returns matching EU documents with counts of Danish statutes referencing them.

Use this for exploratory searches like "data protection" or "privacy" to find relevant EU law.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keyword search (title, short name, CELEX, description)',
        },
        type: {
          type: 'string',
          enum: ['directive', 'regulation'],
          description: 'Filter by document type',
        },
        year_from: {
          type: 'number',
          description: 'Filter by year (from)',
        },
        year_to: {
          type: 'number',
          description: 'Filter by year (to)',
        },
        community: {
          type: 'string',
          enum: ['EU', 'EG', 'EEG', 'Euratom'],
          description: 'Filter by community',
        },
        has_danish_implementation: {
          type: 'boolean',
          description: 'Filter by Danish implementation existence',
        },
        limit: {
          type: 'number',
          description: 'Maximum results (default: 20, max: 100)',
        },
      },
    },
  },
  {
    name: 'get_provision_eu_basis',
    description: `Get EU legal basis for a specific provision within a Danish statute.

Returns EU directives/regulations that a specific provision implements or references, with article-level precision. For example, DSL 2:1 references GDPR Article 6.1.c.

Use this for pinpoint EU compliance checks at the provision level.`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'document ID (e.g., "2018:218")',
        },
        provision_ref: {
          type: 'string',
          description: 'Provision reference (e.g., "1:1" or "3:5")',
        },
      },
      required: ['document_id', 'provision_ref'],
    },
  },
  {
    name: 'validate_eu_compliance',
    description: `Validate EU compliance status for a Danish statute or provision.

Checks for:
- References to repealed EU directives (e.g., Data Protection Directive 95/46/EC)
- Missing implementation status
- Outdated references

Returns compliance status (compliant, partial, unclear, not_applicable) with warnings and recommendations.

Note: This is Phase 1 validation. Full compliance checking against EU requirements will be added in future phases.`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'document ID (e.g., "2018:218")',
        },
        provision_ref: {
          type: 'string',
          description: 'Optional provision reference (e.g., "1:1")',
        },
        eu_document_id: {
          type: 'string',
          description: 'Optional: check compliance with specific EU document',
        },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'list_sources',
    description:
      'List all data sources and their provenance. ' +
      'Returns source URLs, licenses, and coverage information for transparency and audit compliance.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'about',
    description:
      'Server metadata, dataset statistics, freshness, and provenance. ' +
      'Call this to verify data coverage, currency, and content basis before relying on results.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

const server = new Server(
  { name: SERVER_NAME, version: pkgVersion },
  { capabilities: { tools: {}, resources: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error(`[${SERVER_NAME}] ListTools request received`);
  return { tools: TOOLS };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  console.error(`[${SERVER_NAME}] ListResources request received`);
  return {
    resources: [
      {
        uri: 'case-law-stats://danish-law-mcp/metadata',
        name: 'Case Law Statistics',
        description: 'Metadata about case law data freshness and coverage',
        mimeType: 'application/json',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  console.error(`[${SERVER_NAME}] ReadResource: ${uri}`);

  if (uri === 'case-law-stats://danish-law-mcp/metadata') {
    try {
      const db = getDb();

      // Check if sync metadata table exists
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='case_law_sync_metadata'
      `).get();

      if (!tableExists) {
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  status: 'no_data',
                  message: 'No case law data has been synced yet. Run npm run sync:cases to fetch case law.',
                  last_sync_date: null,
                  last_decision_date: null,
                  total_cases: 0,
                  cases_by_court: {},
                  source: {
                    name: 'Retsinformation',
                    url: 'https://www.retsinformation.dk',
                    license: 'Public domain (Danish legal texts)',
                    attribution: 'Case law from Retsinformation.dk',
                  },
                  update_frequency: 'weekly',
                  coverage: '1993-present (varies by court)',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Get sync metadata
      const syncMeta = db.prepare(`
        SELECT last_sync_date, last_decision_date, cases_count, source
        FROM case_law_sync_metadata
        WHERE id = 1
      `).get() as
        | { last_sync_date: string; last_decision_date: string | null; cases_count: number; source: string }
        | undefined;

      // Get total case count
      const totalRow = db.prepare('SELECT COUNT(*) as count FROM case_law').get() as { count: number };
      const totalCases = totalRow.count;

      // Get cases by court
      const courtCounts = db.prepare(`
        SELECT court, COUNT(*) as count
        FROM case_law
        GROUP BY court
        ORDER BY count DESC
      `).all() as { court: string; count: number }[];

      const casesByCourt: Record<string, number> = {};
      for (const row of courtCounts) {
        casesByCourt[row.court] = row.count;
      }

      const stats = {
        last_sync_date: syncMeta?.last_sync_date || new Date().toISOString(),
        last_decision_date: syncMeta?.last_decision_date || null,
        total_cases: totalCases,
        cases_by_court: casesByCourt,
        source: {
          name: syncMeta?.source || 'Retsinformation',
          url: 'https://www.retsinformation.dk',
          license: 'Public domain (Danish legal texts)',
          attribution: 'Case law from Retsinformation.dk',
        },
        update_frequency: 'weekly',
        coverage: '1993-present (varies by court)',
      };

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${SERVER_NAME}] ReadResource failed: ${message}`);
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ error: `Failed to read case law stats: ${message}` }, null, 2),
          },
        ],
      };
    }
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'text/plain',
        text: `Error: Unknown resource URI "${uri}"`,
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`[${SERVER_NAME}] CallTool: ${name}`);

  try {
    let result: unknown;

    switch (name) {
      case 'search_legislation':
        result = await searchLegislation(getDb(), args as unknown as SearchLegislationInput);
        break;
      case 'get_provision':
        result = await getProvision(getDb(), args as unknown as GetProvisionInput);
        break;
      case 'search_case_law':
        result = await searchCaseLaw(getDb(), args as unknown as SearchCaseLawInput);
        break;
      case 'get_preparatory_works':
        result = await getPreparatoryWorks(getDb(), args as unknown as GetPreparatoryWorksInput);
        break;
      case 'validate_citation':
        result = await validateCitationTool(getDb(), args as unknown as ValidateCitationInput);
        break;
      case 'build_legal_stance':
        result = await buildLegalStance(getDb(), args as unknown as BuildLegalStanceInput);
        break;
      case 'format_citation':
        result = await formatCitationTool(args as unknown as FormatCitationInput);
        break;
      case 'check_currency':
        result = await checkCurrency(getDb(), args as unknown as CheckCurrencyInput);
        break;
      case 'get_eu_basis':
        result = await getEUBasis(getDb(), args as unknown as GetEUBasisInput);
        break;
      case 'get_danish_implementations':
      case 'get_swedish_implementations':
        result = await getDanishImplementations(getDb(), args as unknown as GetDanishImplementationsInput);
        break;
      case 'search_eu_implementations':
        result = await searchEUImplementations(getDb(), args as unknown as SearchEUImplementationsInput);
        break;
      case 'get_provision_eu_basis':
        result = await getProvisionEUBasis(getDb(), args as unknown as GetProvisionEUBasisInput);
        break;
      case 'validate_eu_compliance':
        result = await validateEUCompliance(getDb(), args as unknown as ValidateEUComplianceInput);
        break;
      case 'list_sources':
        result = {
          sources: [
            {
              name: 'Retsinformation',
              url: 'https://www.retsinformation.dk',
              description: 'Official Danish legal information system (primary document source)',
              license: 'Public domain (Danish legal texts)',
              coverage: 'Danish statutes, regulations, and legal documents',
            },
            {
              name: 'Retsinformation API',
              url: 'https://api.retsinformation.dk',
              description: 'Programmatic access to Danish legal documents (update feed)',
              license: 'Public domain (Danish legal texts)',
              coverage: 'Document update notifications and metadata',
            },
            {
              name: 'EUR-Lex',
              url: 'https://eur-lex.europa.eu',
              description: 'Official EU legislation database (EU directive/regulation metadata)',
              license: 'EU public domain',
              coverage: 'EU directives and regulations referenced by Danish statutes',
            },
          ],
          authenticity_note:
            'All data is sourced from official public legal information services. Verify legal conclusions against current official publications on Retsinformation and Lovtidende.',
        };
        break;
      case 'about':
        result = getAbout(getDb(), aboutContext);
        break;
      default:
        return {
          content: [{ type: 'text', text: `Error: Unknown tool "${name}".` }],
          isError: true,
        };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${SERVER_NAME}] Tool ${name} failed: ${message}`);
    return {
      content: [{ type: 'text', text: `Error executing ${name}: ${message}` }],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  console.error(`[${SERVER_NAME}] Starting server v${pkgVersion}...`);

  const transport = new StdioServerTransport();

  process.on('SIGINT', () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    closeDb();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    closeDb();
    process.exit(0);
  });

  await server.connect(transport);
  console.error(`[${SERVER_NAME}] Server started successfully`);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  closeDb();
  process.exit(1);
});
