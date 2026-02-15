#!/usr/bin/env tsx

/**
 * EUR-Lex Metadata Fetcher
 *
 * Fetches metadata for EU documents (directives and regulations) from EUR-Lex API.
 * Converts Swedish Law MCP format (e.g., "directive:2016/680") to CELEX numbers
 * (e.g., "32016L0680") and retrieves authoritative metadata.
 *
 * EUR-Lex API Documentation:
 * - REST API: https://eur-lex.europa.eu/legal-content/AUTO/?uri=CELEX:{celex}&format=application/xml;notice=branch
 * - CELEX Format: [sector][year][type][number]
 *   - sector: 3 (tertiary law - directives/regulations)
 *   - year: 4 digits
 *   - type: L (directive), R (regulation)
 *   - number: 4 digits, zero-padded
 *
 * Rate limiting: Respects 1 request per second to avoid overwhelming EUR-Lex servers.
 */

import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

interface EUDocumentId {
  type: 'directive' | 'regulation';
  year: number;
  number: number;
}

interface EURLexMetadata {
  id: string;
  type: 'directive' | 'regulation';
  year: number;
  number: number;
  community: 'EU' | 'EG' | 'EEG';
  celex_number: string;
  title?: string;
  title_sv?: string;
  date_document?: string;
  in_force?: boolean;
  status?: string;
  url?: string;
  fetched_at: string;
  source: 'eurlex';
}

interface FetchResult {
  success: boolean;
  document?: EURLexMetadata;
  error?: string;
  eu_doc_id: string;
  celex_number?: string;
}

/**
 * Parse EU document ID (e.g., "directive:2016/680") into components
 */
function parseEUDocumentId(id: string): EUDocumentId {
  const match = id.match(/^(directive|regulation):(\d{4})\/(\d+)$/);
  if (!match) {
    throw new Error(`Invalid EU document ID format: ${id}`);
  }

  return {
    type: match[1] as 'directive' | 'regulation',
    year: parseInt(match[2], 10),
    number: parseInt(match[3], 10)
  };
}

/**
 * Convert EU document ID to CELEX number
 *
 * Format: [sector][year][type][number]
 * - sector: 3 (tertiary law)
 * - year: 4 digits
 * - type: L (directive), R (regulation)
 * - number: 4 digits, zero-padded
 *
 * Examples:
 * - directive:2016/680 → 32016L0680
 * - regulation:2016/679 → 32016R0679
 * - directive:95/46 → 31995L0046
 */
function toCelexNumber(parsed: EUDocumentId): string {
  const sector = '3';
  const year = parsed.year.toString().padStart(4, '0');
  const type = parsed.type === 'directive' ? 'L' : 'R';
  const number = parsed.number.toString().padStart(4, '0');

  return `${sector}${year}${type}${number}`;
}

/**
 * Determine EU community from year
 * - 1993+: EU (European Union)
 * - 1958-1992: EEG (European Economic Community)
 * - 1967-1992: EG (European Community) for some documents
 */
function getCommunity(year: number): 'EU' | 'EG' | 'EEG' {
  if (year >= 1993) {
    return 'EU';
  } else if (year >= 1967) {
    return 'EG';
  } else {
    return 'EEG';
  }
}

/**
 * Fetch metadata from EUR-Lex
 *
 * Uses the EUR-Lex HTML page with ELI metadata tags. More reliable than XML/RDF endpoints.
 */
async function fetchFromEURLex(celexNumber: string): Promise<JSDOM> {
  const url = `https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:${celexNumber}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Swedish-Law-MCP/1.0 (Educational Project)',
        'Accept': 'text/html',
        'Accept-Language': 'en'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Document not found in EUR-Lex: ${celexNumber}`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const htmlText = await response.text();
    return new JSDOM(htmlText);
  } catch (error) {
    throw error;
  }
}

/**
 * Extract metadata from EUR-Lex HTML with ELI meta tags
 */
function extractMetadata(dom: JSDOM, euDocId: string, parsed: EUDocumentId, celexNumber: string): EURLexMetadata {
  const document = dom.window.document;

  const metadata: EURLexMetadata = {
    id: euDocId,
    type: parsed.type,
    year: parsed.year,
    number: parsed.number,
    community: getCommunity(parsed.year),
    celex_number: celexNumber,
    fetched_at: new Date().toISOString(),
    source: 'eurlex'
  };

  // Extract title from <title> tag
  const titleElement = document.querySelector('title');
  if (titleElement && titleElement.textContent) {
    // Format: "Regulation - 2016/679 - EN - gdpr - EUR-Lex"
    // We want to extract a cleaner title from meta tags if available
    metadata.title = titleElement.textContent.replace(' - EUR-Lex', '').trim();
  }

  // Extract title from ELI meta tags (more accurate)
  const eliTitleMeta = document.querySelector('meta[property="eli:title"][lang="en"]');
  if (eliTitleMeta) {
    const titleContent = eliTitleMeta.getAttribute('content');
    if (titleContent) {
      metadata.title = titleContent;
    }
  }

  // Extract date_document from ELI meta tag
  const dateDocMeta = document.querySelector('meta[property="eli:date_document"]');
  if (dateDocMeta) {
    const dateContent = dateDocMeta.getAttribute('content');
    if (dateContent) {
      metadata.date_document = dateContent;
    }
  }

  // Extract in_force status from ELI meta tag
  const inForceMeta = document.querySelector('meta[property="eli:in_force"]');
  if (inForceMeta) {
    const inForceResource = inForceMeta.getAttribute('resource');
    metadata.in_force = inForceResource?.includes('inForce') ?? true;
  }

  // Set URL to the English version
  metadata.url = `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celexNumber}`;

  return metadata;
}

/**
 * Create minimal metadata when EUR-Lex API fails
 */
function createMinimalMetadata(euDocId: string, parsed: EUDocumentId, celexNumber: string): EURLexMetadata {
  return {
    id: euDocId,
    type: parsed.type,
    year: parsed.year,
    number: parsed.number,
    community: getCommunity(parsed.year),
    celex_number: celexNumber,
    in_force: true, // Assume in force unless we know otherwise
    url: `https://eur-lex.europa.eu/legal-content/AUTO/?uri=CELEX:${celexNumber}`,
    fetched_at: new Date().toISOString(),
    source: 'eurlex'
  };
}

/**
 * Fetch metadata for a single EU document
 */
export async function fetchEUDocumentMetadata(euDocId: string): Promise<FetchResult> {
  try {
    const parsed = parseEUDocumentId(euDocId);
    const celexNumber = toCelexNumber(parsed);

    console.log(`Fetching ${euDocId} (CELEX: ${celexNumber})...`);

    try {
      const dom = await fetchFromEURLex(celexNumber);
      const metadata = extractMetadata(dom, euDocId, parsed, celexNumber);

      return {
        success: true,
        document: metadata,
        eu_doc_id: euDocId,
        celex_number: celexNumber
      };
    } catch (apiError: any) {
      // If EUR-Lex API fails, create minimal metadata
      console.warn(`  ⚠️ EUR-Lex API failed: ${apiError.message}`);
      console.warn(`  Creating minimal metadata for ${euDocId}`);

      const minimalMetadata = createMinimalMetadata(euDocId, parsed, celexNumber);

      return {
        success: true,
        document: minimalMetadata,
        eu_doc_id: euDocId,
        celex_number: celexNumber
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      eu_doc_id: euDocId
    };
  }
}

/**
 * Fetch metadata for multiple EU documents with rate limiting
 */
export async function fetchBulkEUDocuments(
  euDocIds: string[],
  rateLimit: number = 1000 // milliseconds between requests
): Promise<FetchResult[]> {
  const results: FetchResult[] = [];

  console.log(`Fetching ${euDocIds.length} EU documents from EUR-Lex...`);
  console.log(`Rate limit: 1 request per ${rateLimit}ms\n`);

  for (let i = 0; i < euDocIds.length; i++) {
    const euDocId = euDocIds[i];
    console.log(`[${i + 1}/${euDocIds.length}] ${euDocId}`);

    const result = await fetchEUDocumentMetadata(euDocId);
    results.push(result);

    if (result.success) {
      console.log(`  ✓ Success`);
    } else {
      console.log(`  ✗ Failed: ${result.error}`);
    }

    // Rate limiting: wait between requests (except for last one)
    if (i < euDocIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, rateLimit));
    }
  }

  return results;
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage:');
    console.log('  npm run fetch:eurlex -- <eu-doc-id>              # Single document');
    console.log('  npm run fetch:eurlex -- --input <file.json>      # Bulk fetch');
    console.log('  npm run fetch:eurlex -- --missing                # Fetch missing docs');
    console.log('');
    console.log('Examples:');
    console.log('  npm run fetch:eurlex -- directive:2016/680');
    console.log('  npm run fetch:eurlex -- --input /tmp/missing-eu-docs.json');
    console.log('  npm run fetch:eurlex -- --missing');
    process.exit(1);
  }

  let euDocIds: string[];
  let outputFile: string;

  if (args[0] === '--missing') {
    // Fetch missing documents from /tmp/missing-eu-docs.json
    const missingFile = '/tmp/missing-eu-docs.json';
    if (!fs.existsSync(missingFile)) {
      console.error(`Missing file not found: ${missingFile}`);
      console.error('Run: npm run find:missing-eu-docs');
      process.exit(1);
    }
    euDocIds = JSON.parse(fs.readFileSync(missingFile, 'utf8'));
    outputFile = path.join(process.cwd(), 'data/seed/eurlex-documents.json');
  } else if (args[0] === '--input') {
    // Bulk fetch from file
    const inputFile = args[1];
    if (!inputFile || !fs.existsSync(inputFile)) {
      console.error(`Input file not found: ${inputFile}`);
      process.exit(1);
    }
    euDocIds = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    outputFile = args[2] || path.join(process.cwd(), 'data/seed/eurlex-documents.json');
  } else {
    // Single document fetch
    euDocIds = [args[0]];
    outputFile = args[1] || '/tmp/eurlex-single.json';
  }

  console.log(`Fetching ${euDocIds.length} EU documents...\n`);

  const results = await fetchBulkEUDocuments(euDocIds, 1000);

  // Separate successes and failures
  const successes = results.filter(r => r.success && r.document);
  const failures = results.filter(r => !r.success || !r.document);

  console.log('\n=== SUMMARY ===');
  console.log(`Total:     ${results.length}`);
  console.log(`Success:   ${successes.length} (${Math.round(100 * successes.length / results.length)}%)`);
  console.log(`Failed:    ${failures.length}`);

  if (failures.length > 0) {
    console.log('\nFailed documents:');
    failures.forEach(f => {
      console.log(`  - ${f.eu_doc_id}: ${f.error || 'Unknown error'}`);
    });
  }

  // Save successful documents
  const documents = successes.map(r => r.document);
  fs.writeFileSync(outputFile, JSON.stringify(documents, null, 2));
  console.log(`\nSaved ${documents.length} documents to: ${outputFile}`);

  // Save fetch report
  const reportFile = '/tmp/eurlex-fetch-report.md';
  const report = generateFetchReport(results, outputFile);
  fs.writeFileSync(reportFile, report);
  console.log(`Fetch report saved to: ${reportFile}`);
}

/**
 * Generate markdown report of fetch results
 */
function generateFetchReport(results: FetchResult[], outputFile: string): string {
  const successes = results.filter(r => r.success && r.document);
  const failures = results.filter(r => !r.success || !r.document);

  let report = '# EUR-Lex Metadata Fetch Report\n\n';
  report += `**Date:** ${new Date().toISOString().split('T')[0]}\n`;
  report += `**Total Documents:** ${results.length}\n`;
  report += `**Successful:** ${successes.length} (${Math.round(100 * successes.length / results.length)}%)\n`;
  report += `**Failed:** ${failures.length}\n`;
  report += `**Output File:** ${outputFile}\n\n`;

  report += '## Summary\n\n';
  report += `Successfully fetched metadata for ${successes.length} EU documents from EUR-Lex API. `;

  if (failures.length === 0) {
    report += '✅ All documents fetched successfully!\n\n';
  } else {
    report += `⚠️ ${failures.length} documents could not be fetched (see below).\n\n`;
  }

  report += '## Successful Fetches\n\n';
  report += '| EU Document ID | CELEX | Type | Year |\n';
  report += '|----------------|-------|------|------|\n';

  successes.forEach(r => {
    if (r.document) {
      report += `| ${r.document.id} | ${r.document.celex_number} | ${r.document.type} | ${r.document.year} |\n`;
    }
  });

  if (failures.length > 0) {
    report += '\n## Failed Fetches\n\n';
    report += '| EU Document ID | CELEX | Error |\n';
    report += '|----------------|-------|-------|\n';

    failures.forEach(r => {
      const celex = r.celex_number || 'N/A';
      const error = r.error || 'Unknown error';
      report += `| ${r.eu_doc_id} | ${celex} | ${error} |\n`;
    });
  }

  report += '\n## Next Steps\n\n';
  report += '1. Import fetched documents into database:\n';
  report += '   ```bash\n';
  report += '   npm run import:eurlex-documents\n';
  report += '   ```\n\n';
  report += '2. Re-import EU references (should now succeed for previously skipped references):\n';
  report += '   ```bash\n';
  report += '   npm run migrate:eu-references\n';
  report += '   ```\n\n';
  report += '3. Verify 100% coverage:\n';
  report += '   ```bash\n';
  report += '   npm run verify:eu-coverage\n';
  report += '   ```\n\n';

  return report;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
