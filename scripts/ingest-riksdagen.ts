#!/usr/bin/env tsx
/**
 * Riksdagen Data Ingestion Script
 *
 * Fetches Danish statutes from Riksdagen's open data API and converts
 * them to seed JSON format for the Swedish Legal Citation MCP server.
 *
 * Pipeline:
 *   Riksdagen API -> ingest-riksdagen.ts -> data/seed/{sfs}.json -> build-db.ts -> database.db
 *
 * Usage:
 *   npm run ingest -- <sfs-number> <output-path>
 *
 * Examples:
 *   npm run ingest -- 2018:218 data/seed/2018_218.json
 *   npm run ingest -- 1998:204 data/seed/1998_204.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { parseRiksdagenProvisions } from '../src/parsers/riksdagen-provision-parser.js';
import { parseStatuteText } from '../src/parsers/provision-parser.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const RIKSDAGEN_DOC_URL = 'https://data.riksdagen.se/dokument';
const RIKSDAGEN_LIST_URL = 'https://data.riksdagen.se/dokumentlista';
const REQUEST_DELAY_MS = 500;
const USER_AGENT = 'Swedish-Law-MCP/0.1.0 (https://github.com/Ansvar-Systems/swedish-law-mcp)';

/** Known statutes with metadata for enrichment */
const KNOWN_STATUTES: Record<string, StatuteMetadata> = {
  '2018:218': {
    short_name: 'DSL',
    title_en: 'Act with supplementary provisions to the EU GDPR',
    in_force_date: '2018-05-25',
  },
  '1962:700': {
    short_name: 'BrB',
    title_en: 'The Swedish Criminal Code',
    in_force_date: '1965-01-01',
  },
  '2009:400': {
    short_name: 'OSL',
    title_en: 'Public Access to Information and Secrecy Act',
    in_force_date: '2009-06-30',
  },
  '1977:1160': {
    short_name: 'AML',
    title_en: 'Work Environment Act',
    in_force_date: '1978-07-01',
  },
  '1998:204': {
    short_name: 'PUL',
    title_en: 'Personal Data Act',
    in_force_date: '1998-10-24',
    status: 'repealed',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface StatuteMetadata {
  short_name?: string;
  title_en?: string;
  in_force_date?: string;
  status?: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
}

interface RiksdagenDocument {
  dok_id: string;
  rm: string;
  beteckning: string;
  typ: string;
  doktyp: string;
  titel: string;
  undertitel?: string;
  subtitel?: string;
  datum: string;
  publicerad?: string;
  html_url?: string;
  html?: string;
  text?: string;
}

function extractSfsId(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/(\d{4}:\d+)/);
  return match?.[1];
}

interface SeedOutput {
  id: string;
  type: 'statute' | 'bill' | 'sou' | 'ds' | 'case_law';
  title: string;
  title_en?: string;
  short_name?: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date?: string;
  in_force_date?: string;
  url?: string;
  description?: string;
  provisions?: ProvisionOutput[];
  definitions?: DefinitionOutput[];
  preparatory_works?: PrepWorkOutput[];
}

interface ProvisionOutput {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
}

interface DefinitionOutput {
  term: string;
  definition: string;
  source_provision?: string;
}

interface PrepWorkOutput {
  prep_document_id: string;
  title: string;
  summary?: string;
}

const KNOWN_PREPARATORY_WORKS: Record<string, PrepWorkOutput[]> = {
  '2018:218': [
    {
      prep_document_id: '2017/18:105',
      title: 'Proposition 2017/18:105 Ny dataskyddslag',
    },
    {
      prep_document_id: '2017:39',
      title: 'SOU 2017:39 Dataskydd inom socialtjänst, tillsyn och arbetslöshetsförsäkring',
    },
  ],
};

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractHtmlMetadata(html: string | undefined): Record<string, string> {
  if (!html) {
    return {};
  }

  const header = html.slice(0, 3000);
  const pairs = Array.from(header.matchAll(/<b>\s*([^<:]+?)\s*<\/b>\s*:\s*([^<]+)\s*(?:<br|$)/giu));
  const metadata: Record<string, string> = {};

  for (const [, rawKey, rawValue] of pairs) {
    const key = normalizeWhitespace(rawKey);
    const value = normalizeWhitespace(rawValue);
    if (key && value) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function deriveStatus(
  known: StatuteMetadata | undefined,
  metadata: Record<string, string>
): 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force' {
  if (known?.status) {
    return known.status;
  }

  if (metadata['Upphävd']) {
    return 'repealed';
  }

  return 'in_force';
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

function startsLikeProvisionContent(content: string): boolean {
  return /^[A-ZÅÄÖ0-9]/u.test(content);
}

function looksLikeContinuation(content: string): boolean {
  return /^[a-zåäö§,.;:\)\]-]/u.test(content);
}

function qualityScore(provision: ProvisionOutput): number {
  const content = provision.content.trim();
  let score = 0;

  if (startsLikeProvisionContent(content)) {
    score += 4;
  }

  if (looksLikeContinuation(content)) {
    score -= 4;
  }

  if (content.length >= 40) {
    score += 1;
  }
  if (content.length >= 120) {
    score += 1;
  }

  if (/Lag \(\d{4}:\d+\)\.?$/u.test(content)) {
    score += 1;
  }

  return score;
}

function selectPreferredProvision(a: ProvisionOutput, b: ProvisionOutput): ProvisionOutput {
  const scoreA = qualityScore(a);
  const scoreB = qualityScore(b);

  if (scoreA !== scoreB) {
    return scoreB > scoreA ? b : a;
  }

  if (b.content.length !== a.content.length) {
    return b.content.length > a.content.length ? b : a;
  }

  return a;
}

function dedupeByProvisionRef(provisions: ProvisionOutput[]): {
  provisions: ProvisionOutput[];
  duplicateRefs: number;
  replacements: number;
} {
  const byRef = new Map<string, ProvisionOutput>();
  const order: string[] = [];
  let duplicateRefs = 0;
  let replacements = 0;

  for (const provision of provisions) {
    const existing = byRef.get(provision.provision_ref);
    if (!existing) {
      byRef.set(provision.provision_ref, provision);
      order.push(provision.provision_ref);
      continue;
    }

    duplicateRefs++;
    const preferred = selectPreferredProvision(existing, provision);
    if (preferred !== existing) {
      byRef.set(provision.provision_ref, preferred);
      replacements++;
    }
  }

  return {
    provisions: order.map(ref => byRef.get(ref)!),
    duplicateRefs,
    replacements,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetching
// ─────────────────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
  }

  return response.json();
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ingestion
// ─────────────────────────────────────────────────────────────────────────────

export async function ingest(sfsNumber: string, outputPath: string): Promise<void> {
  console.log('Riksdagen Data Ingestion');
  console.log(`  SFS: ${sfsNumber}`);
  console.log(`  Output: ${outputPath}`);
  console.log('');

  // Step 1: Fetch document metadata from Riksdagen
  console.log('Fetching document list from Riksdagen...');
  const listUrl = `${RIKSDAGEN_LIST_URL}/?sok=${encodeURIComponent(sfsNumber)}&doktyp=sfs&format=json&utformat=json`;

  const listData = await fetchJson(listUrl) as { dokumentlista?: { dokument?: RiksdagenDocument[] } };
  const documents = listData?.dokumentlista?.dokument ?? [];

  if (documents.length === 0) {
    console.error(`No documents found for SFS ${sfsNumber}`);
    process.exit(1);
  }

  const requestedSfs = extractSfsId(sfsNumber) ?? sfsNumber;
  const doc = documents.find(d => extractSfsId(d.beteckning) === requestedSfs)
    ?? documents.find(d => extractSfsId(d.titel) === requestedSfs)
    ?? documents[0];

  if ((extractSfsId(doc.beteckning) ?? extractSfsId(doc.titel)) !== requestedSfs) {
    console.log(`  WARNING: Exact SFS match not found; using closest hit ${doc.beteckning}`);
  }

  console.log(`  Found: ${doc.titel}`);

  await delay(REQUEST_DELAY_MS);

  // Step 2: Fetch full document text
  console.log('Fetching document text...');
  const docUrl = `${RIKSDAGEN_DOC_URL}/${doc.dok_id}.json`;
  const docData = await fetchJson(docUrl) as { dokumentstatus?: { dokument?: RiksdagenDocument } };
  const fullDoc = docData?.dokumentstatus?.dokument;

  if (!fullDoc) {
    console.error('Could not retrieve document details');
    process.exit(1);
  }

  const rawText = fullDoc.text || '';
  console.log(`  Text length: ${rawText.length} chars`);

  // Step 3: Parse provisions
  console.log('Parsing provisions...');
  const parseResult = parseRiksdagenProvisions(rawText);
  const strictParsed = parseResult.provisions as ProvisionOutput[];
  const strictDeduped = dedupeByProvisionRef(strictParsed);

  const fallbackProvisions = parseStatuteText(rawText) as ProvisionOutput[];
  const fallbackDeduped = dedupeByProvisionRef(fallbackProvisions);

  // If the strict parser suppresses many candidates and the generic parser yields
  // materially better coverage, prefer the generic result for this statute.
  const shouldUseFallback = (
    parseResult.diagnostics.ignored_chapter_markers === 0 &&
    parseResult.diagnostics.suppressed_section_candidates >= 20 &&
    fallbackDeduped.provisions.length >= strictDeduped.provisions.length + 10 &&
    fallbackDeduped.provisions.length >= Math.ceil(strictDeduped.provisions.length * 1.25)
  );

  const deduped = shouldUseFallback ? fallbackDeduped : strictDeduped;
  const provisions = deduped.provisions;
  const withTitles = provisions.filter(p => p.title).length;
  console.log(`  Found ${provisions.length} provisions (${withTitles} with titles)`);
  if (shouldUseFallback) {
    console.log(
      `  Parser fallback activated: strict=${strictDeduped.provisions.length}, ` +
      `fallback=${fallbackDeduped.provisions.length}, suppressed=${parseResult.diagnostics.suppressed_section_candidates}`
    );
  }
  if (parseResult.diagnostics.ignored_chapter_markers > 0 || parseResult.diagnostics.suppressed_section_candidates > 0) {
    console.log(
      `  Parser diagnostics: ignored chapters=${parseResult.diagnostics.ignored_chapter_markers}, ` +
      `suppressed section candidates=${parseResult.diagnostics.suppressed_section_candidates}`
    );
  }
  if (deduped.duplicateRefs > 0) {
    console.log(
      `  De-duplicated ${deduped.duplicateRefs} duplicate refs ` +
      `(replaced ${deduped.replacements} with better candidates)`
    );
  }

  // Step 4: Build seed output
  const known = KNOWN_STATUTES[requestedSfs];
  const htmlMetadata = extractHtmlMetadata(fullDoc.html);
  const status = deriveStatus(known, htmlMetadata);
  const repealDate = normalizeDate(htmlMetadata['Upphävd']);
  const repealedBy = htmlMetadata['Författningen har upphävts genom'];
  const issuedDate = normalizeDate(htmlMetadata['Utfärdad'] ?? doc.datum);
  const inForceDate = normalizeDate(htmlMetadata['Ikraft']) ?? known?.in_force_date;
  const baseTitle = normalizeWhitespace(doc.titel || `SFS ${requestedSfs}`);

  const seed: SeedOutput = {
    id: requestedSfs,
    type: 'statute',
    title: baseTitle,
    title_en: known?.title_en,
    short_name: known?.short_name,
    status,
    issued_date: issuedDate,
    in_force_date: inForceDate,
    url: doc.html_url || `https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/sfs-${requestedSfs.replace(':', '-')}`,
    description: status === 'repealed'
      ? [repealDate ? `Upphävd ${repealDate}` : 'Upphävd', repealedBy ? `genom ${repealedBy}` : null]
          .filter((part): part is string => part != null)
          .join(' ')
      : undefined,
    provisions: provisions.length > 0 ? provisions : undefined,
    preparatory_works: KNOWN_PREPARATORY_WORKS[requestedSfs],
  };

  // Step 5: Write output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(seed, null, 2));

  const fileSize = fs.statSync(outputPath).size;
  console.log('');
  console.log('Ingestion complete:');
  console.log(`  Document: ${seed.title}`);
  console.log(`  Provisions: ${provisions.length}`);
  console.log(`  Output: ${outputPath} (${(fileSize / 1024).toFixed(1)} KB)`);
  console.log('');
  console.log('Next step: npm run build:db');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const isMainModule = process.argv[1] != null && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npm run ingest -- <sfs-number> <output-path>');
    console.log('');
    console.log('Examples:');
    console.log('  npm run ingest -- 2018:218 data/seed/2018_218.json');
    console.log('  npm run ingest -- 1998:204 data/seed/1998_204.json');
    console.log('');
    console.log('Known statutes:');
    for (const [sfs, meta] of Object.entries(KNOWN_STATUTES)) {
      console.log(`  ${sfs} (${meta.short_name || 'no short name'})`);
    }
    process.exit(1);
  }

  ingest(args[0], args[1]).catch(error => {
    console.error('Ingestion failed:', error.message);
    process.exit(1);
  });
}
