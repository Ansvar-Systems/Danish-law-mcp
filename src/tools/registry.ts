/**
 * Tool registry for Danish Legal Citation MCP Server.
 * Shared between stdio (index.ts) and HTTP (api/mcp.ts) entry points.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';

import { searchLegislation, SearchLegislationInput } from './search-legislation.js';
import { getProvision, GetProvisionInput } from './get-provision.js';
import { searchCaseLaw, SearchCaseLawInput } from './search-case-law.js';
import { getPreparatoryWorks, GetPreparatoryWorksInput } from './get-preparatory-works.js';
import { validateCitationTool, ValidateCitationInput } from './validate-citation.js';
import { buildLegalStance, BuildLegalStanceInput } from './build-legal-stance.js';
import { formatCitationTool, FormatCitationInput } from './format-citation.js';
import { checkCurrency, CheckCurrencyInput } from './check-currency.js';
import { getEUBasis, GetEUBasisInput } from './get-eu-basis.js';
import { getDanishImplementations, GetDanishImplementationsInput } from './get-danish-implementations.js';
import { searchEUImplementations, SearchEUImplementationsInput } from './search-eu-implementations.js';
import { getProvisionEUBasis, GetProvisionEUBasisInput } from './get-provision-eu-basis.js';
import { validateEUCompliance, ValidateEUComplianceInput } from './validate-eu-compliance.js';
import { getAbout, type AboutContext } from './about.js';
export type { AboutContext } from './about.js';

const LIST_SOURCES_TOOL: Tool = {
  name: 'list_sources',
  description:
    'List all data sources and their provenance. ' +
    'Returns source URLs, licenses, and coverage information for transparency and audit compliance.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

const ABOUT_TOOL: Tool = {
  name: 'about',
  description:
    'Server metadata, dataset statistics, freshness, and provenance. ' +
    'Call this to verify data coverage, currency, and content basis before relying on results.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const TOOLS: Tool[] = [
  {
    name: 'search_legislation',
    description: `Search Danish statutes and regulations by keyword.

Searches provision text using FTS5 with BM25 ranking. Supports boolean operators (AND, OR, NOT), phrase search ("exact phrase"), and prefix matching (term*).

Returns matched provisions with snippets, relevance scores, and document metadata.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query in Danish or English. Supports FTS5 syntax.' },
        document_id: { type: 'string', description: 'Filter to a specific statute by document ID (e.g., "2018:218")' },
        status: { type: 'string', enum: ['in_force', 'amended', 'repealed'], description: 'Filter by document status' },
        as_of_date: { type: 'string', description: 'Optional historical date filter (YYYY-MM-DD).' },
        limit: { type: 'number', description: 'Maximum results (default: 10, max: 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_provision',
    description: `Retrieve a specific provision from a Danish statute.

Specify the document ID and either chapter+section or provision_ref directly.`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'document ID (e.g., "2018:218")' },
        chapter: { type: 'string', description: 'Chapter number (e.g., "3").' },
        section: { type: 'string', description: 'Section number (e.g., "5", "5 a")' },
        provision_ref: { type: 'string', description: 'Direct provision reference (e.g., "3:5")' },
        as_of_date: { type: 'string', description: 'Optional historical date (YYYY-MM-DD).' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'search_case_law',
    description: `Search Danish court decisions (retspraksis). Filter by court and date range.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for case law summaries' },
        court: { type: 'string', description: 'Filter by court' },
        date_from: { type: 'string', description: 'Start date filter (ISO 8601)' },
        date_to: { type: 'string', description: 'End date filter (ISO 8601)' },
        limit: { type: 'number', description: 'Maximum results (default: 10, max: 50)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_preparatory_works',
    description: `Get preparatory works (forarbejder) for a Danish statute. Returns linked preparatory documents.`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'document ID of the statute (e.g., "2018:218")' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'validate_citation',
    description: `Validate a Danish legal citation against the database. Parses the citation, checks existence, and returns warnings.`,
    inputSchema: {
      type: 'object',
      properties: {
        citation: { type: 'string', description: 'Citation string to validate' },
      },
      required: ['citation'],
    },
  },
  {
    name: 'build_legal_stance',
    description: `Build a comprehensive set of citations for a legal question. Searches across statutes, case law, and preparatory works.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Legal question or topic to research' },
        document_id: { type: 'string', description: 'Optionally limit statute search to one document' },
        include_case_law: { type: 'boolean', description: 'Include case law results (default: true)' },
        include_preparatory_works: { type: 'boolean', description: 'Include preparatory works results (default: true)' },
        as_of_date: { type: 'string', description: 'Optional historical date (YYYY-MM-DD).' },
        limit: { type: 'number', description: 'Max results per category (default: 5, max: 20)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'format_citation',
    description: `Format a Danish legal citation per standard conventions (full, short, or pinpoint).`,
    inputSchema: {
      type: 'object',
      properties: {
        citation: { type: 'string', description: 'Citation string to format' },
        format: { type: 'string', enum: ['full', 'short', 'pinpoint'], description: 'Output format (default: "full")' },
      },
      required: ['citation'],
    },
  },
  {
    name: 'check_currency',
    description: `Check if a Danish statute or provision is in force (current or historical).`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'document ID (e.g., "2018:218")' },
        provision_ref: { type: 'string', description: 'Optional provision reference (e.g., "3:5")' },
        as_of_date: { type: 'string', description: 'Optional historical date (YYYY-MM-DD).' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_eu_basis',
    description: `Get EU legal basis (directives and regulations) for a Danish statute.`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'document ID (e.g., "2018:218")' },
        include_articles: { type: 'boolean', description: 'Include specific EU article references (default: false)' },
        reference_types: { type: 'array', items: { type: 'string' }, description: 'Filter by reference type' },
      },
      required: ['document_id'],
    },
  },
  {
    name: 'get_danish_implementations',
    description: `Find Danish statutes implementing a specific EU directive or regulation.`,
    inputSchema: {
      type: 'object',
      properties: {
        eu_document_id: { type: 'string', description: 'EU document ID (e.g., "regulation:2016/679")' },
        primary_only: { type: 'boolean', description: 'Return only primary implementing statutes (default: false)' },
        in_force_only: { type: 'boolean', description: 'Return only in-force statutes (default: false)' },
      },
      required: ['eu_document_id'],
    },
  },
  {
    name: 'search_eu_implementations',
    description: `Search for EU directives and regulations with Danish implementation information.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword search (title, short name, CELEX, description)' },
        type: { type: 'string', enum: ['directive', 'regulation'], description: 'Filter by document type' },
        year_from: { type: 'number', description: 'Filter by year (from)' },
        year_to: { type: 'number', description: 'Filter by year (to)' },
        community: { type: 'string', enum: ['EU', 'EG', 'EEG', 'Euratom'], description: 'Filter by community' },
        has_danish_implementation: { type: 'boolean', description: 'Filter by Danish implementation existence' },
        limit: { type: 'number', description: 'Maximum results (default: 20, max: 100)' },
      },
    },
  },
  {
    name: 'get_provision_eu_basis',
    description: `Get EU legal basis for a specific provision within a Danish statute.`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'document ID (e.g., "2018:218")' },
        provision_ref: { type: 'string', description: 'Provision reference (e.g., "1:1" or "3:5")' },
      },
      required: ['document_id', 'provision_ref'],
    },
  },
  {
    name: 'validate_eu_compliance',
    description: `Validate EU compliance status for a Danish statute or provision.`,
    inputSchema: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'document ID (e.g., "2018:218")' },
        provision_ref: { type: 'string', description: 'Optional provision reference (e.g., "1:1")' },
        eu_document_id: { type: 'string', description: 'Optional: check compliance with specific EU document' },
      },
      required: ['document_id'],
    },
  },
];

export function buildTools(context?: AboutContext): Tool[] {
  return context ? [...TOOLS, ABOUT_TOOL, LIST_SOURCES_TOOL] : [...TOOLS, LIST_SOURCES_TOOL];
}

export function registerTools(
  server: Server,
  db: InstanceType<typeof Database>,
  context?: AboutContext,
): void {
  const allTools = buildTools(context);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: unknown;

      switch (name) {
        case 'search_legislation':
          result = await searchLegislation(db, args as unknown as SearchLegislationInput);
          break;
        case 'get_provision':
          result = await getProvision(db, args as unknown as GetProvisionInput);
          break;
        case 'search_case_law':
          result = await searchCaseLaw(db, args as unknown as SearchCaseLawInput);
          break;
        case 'get_preparatory_works':
          result = await getPreparatoryWorks(db, args as unknown as GetPreparatoryWorksInput);
          break;
        case 'validate_citation':
          result = await validateCitationTool(db, args as unknown as ValidateCitationInput);
          break;
        case 'build_legal_stance':
          result = await buildLegalStance(db, args as unknown as BuildLegalStanceInput);
          break;
        case 'format_citation':
          result = await formatCitationTool(args as unknown as FormatCitationInput);
          break;
        case 'check_currency':
          result = await checkCurrency(db, args as unknown as CheckCurrencyInput);
          break;
        case 'get_eu_basis':
          result = await getEUBasis(db, args as unknown as GetEUBasisInput);
          break;
        case 'get_danish_implementations':
        case 'get_swedish_implementations':
          result = await getDanishImplementations(db, args as unknown as GetDanishImplementationsInput);
          break;
        case 'search_eu_implementations':
          result = await searchEUImplementations(db, args as unknown as SearchEUImplementationsInput);
          break;
        case 'get_provision_eu_basis':
          result = await getProvisionEUBasis(db, args as unknown as GetProvisionEUBasisInput);
          break;
        case 'validate_eu_compliance':
          result = await validateEUCompliance(db, args as unknown as ValidateEUComplianceInput);
          break;
        case 'about':
          if (context) {
            result = getAbout(db, context);
          } else {
            return {
              content: [{ type: 'text', text: 'About tool not configured.' }],
              isError: true,
            };
          }
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
      return {
        content: [{ type: 'text', text: `Error executing ${name}: ${message}` }],
        isError: true,
      };
    }
  });
}
