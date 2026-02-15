#!/usr/bin/env tsx
/**
 * Retsinformation ingestion script for Danish Law MCP.
 *
 * Usage:
 *   npm run ingest -- <documentId|accession|xml-url> [output-path]
 *
 * Examples:
 *   npm run ingest -- DI001213
 *   npm run ingest -- B20240100405 data/seed/2024_1004.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SEED_DIR = path.join(PROJECT_ROOT, 'data', 'seed');

const API_BASE = 'https://api.retsinformation.dk/v1';
const USER_AGENT = 'Danish-Law-MCP/1.0.0 (https://github.com/Ansvar-Systems/Denmark-law-mcp)';

interface RemoteDocument {
  documentId: string;
  accessionsnummer: string;
  reasonForChange?: string;
  changeDate?: string;
  documentType?: {
    shortName?: string;
    id?: number;
  };
  href?: string;
}

interface ProvisionSeed {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
}

interface ProvisionVersionSeed extends ProvisionSeed {
  valid_from?: string | null;
  valid_to?: string | null;
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
  provisions: ProvisionSeed[];
  provision_versions: ProvisionVersionSeed[];
  definitions: Array<{
    term: string;
    definition: string;
    source_provision?: string;
  }>;
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
}

function toAsciiKey(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function parseIsoDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

function extractText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).filter(Boolean).join(' ');
  }
  if (typeof node === 'object') {
    const objectNode = node as Record<string, unknown>;

    if (typeof objectNode.Char === 'string') {
      return objectNode.Char;
    }

    const values = Object.entries(objectNode)
      .filter(([key]) => !['id', 'localId', 'SchemaLocation', 'REFid', 'formaChar', 'formaInd'].includes(key))
      .map(([, value]) => extractText(value))
      .filter(Boolean);

    return values.join(' ');
  }
  return '';
}

function parseSectionFromExplicatus(explicatus: unknown): string | undefined {
  const text = normalizeWhitespace(extractText(explicatus));
  if (!text) return undefined;

  const withSymbol = text.match(/§\s*(\d+[a-zA-Z]?)/u);
  if (withSymbol) return withSymbol[1];

  const plain = text.match(/^(\d+[a-zA-Z]?)\.?$/u);
  return plain?.[1];
}

function parseChapter(explicatus: unknown, localId: unknown): string | undefined {
  if (typeof localId === 'string' && localId.trim()) {
    return localId.trim();
  }

  const text = normalizeWhitespace(extractText(explicatus));
  if (!text) return undefined;

  const match = text.match(/kapitel\s+(\d+[a-zA-Z]?)/iu);
  return match?.[1];
}

function inferId(year: unknown, number: unknown, fallback: string): string {
  const yearNum = typeof year === 'string' ? Number.parseInt(year, 10) : Number.parseInt(String(year ?? ''), 10);
  const numberNum = typeof number === 'string' ? Number.parseInt(number, 10) : Number.parseInt(String(number ?? ''), 10);

  if (Number.isFinite(yearNum) && Number.isFinite(numberNum) && yearNum > 1900 && numberNum > 0) {
    return `${yearNum}:${numberNum}`;
  }

  return fallback;
}

function inferStatus(rawStatus: unknown, startDate?: string, endDate?: string): SeedOutput['status'] {
  const statusText = String(rawStatus ?? '').toLowerCase();
  const today = new Date().toISOString().slice(0, 10);

  if (startDate && startDate > today) return 'not_yet_in_force';
  if (endDate && endDate < today) return 'repealed';
  if (statusText.includes('valid') || statusText.includes('gældende')) return 'in_force';
  if (statusText.includes('amend')) return 'amended';

  return 'in_force';
}

function inferType(shortName: string): SeedOutput['type'] {
  const upper = shortName.toUpperCase();

  if (upper.startsWith('LOV') || upper.startsWith('LBK') || upper.startsWith('BEK') || upper.startsWith('FOR')) {
    return 'statute';
  }
  if (upper.startsWith('L ')) return 'bill';

  return 'statute';
}

function normalizeHref(href: string): string {
  return href
    .replace(/^http:\/\/retsinformation\.dk/i, 'https://www.retsinformation.dk')
    .replace(/^https:\/\/retsinformation\.dk/i, 'https://www.retsinformation.dk');
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/xml,text/xml,*/*',
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

async function resolveDocument(identifier: string): Promise<RemoteDocument> {
  if (/^https?:\/\//i.test(identifier)) {
    return {
      documentId: 'unknown',
      accessionsnummer: identifier,
      href: identifier,
      documentType: { shortName: 'UNKNOWN' },
    };
  }

  // Try documentId endpoint first
  try {
    return await fetchJson<RemoteDocument>(`${API_BASE}/Documents/${encodeURIComponent(identifier)}`);
  } catch {
    // Fall through
  }

  // Try accession as direct XML href
  if (/^[A-Z]\d{8,}$/i.test(identifier)) {
    return {
      documentId: 'unknown',
      accessionsnummer: identifier,
      href: `https://www.retsinformation.dk/eli/accn/${identifier}/xml`,
      documentType: { shortName: 'UNKNOWN' },
    };
  }

  throw new Error(`Could not resolve identifier "${identifier}" via Retsinformation API`);
}

function extractDefinitions(provisions: ProvisionSeed[]) {
  const definitions: Array<{ term: string; definition: string; source_provision?: string }> = [];

  for (const provision of provisions) {
    // Minimal heuristic for Danish definition clauses.
    const sentence = provision.content.match(/Ved\s+([A-Za-zÆØÅæøå\- ]{2,60})\s+forstås\s+([^\.]+)\./u);
    if (!sentence) continue;

    definitions.push({
      term: normalizeWhitespace(sentence[1].toLowerCase()),
      definition: normalizeWhitespace(sentence[2]),
      source_provision: provision.provision_ref,
    });
  }

  return definitions;
}

function dedupeProvisions(provisions: ProvisionSeed[]): ProvisionSeed[] {
  const map = new Map<string, ProvisionSeed>();

  for (const provision of provisions) {
    const existing = map.get(provision.provision_ref);
    if (!existing || provision.content.length > existing.content.length) {
      map.set(provision.provision_ref, provision);
    }
  }

  return [...map.values()];
}

function collectProvisions(root: unknown): ProvisionSeed[] {
  const provisions: ProvisionSeed[] = [];

  function walk(node: unknown, chapter?: string): void {
    if (node == null) return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item, chapter);
      return;
    }

    if (typeof node !== 'object') return;

    const objectNode = node as Record<string, unknown>;

    for (const kapitel of asArray<Record<string, unknown>>(objectNode.Kapitel as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
      const nextChapter = parseChapter(kapitel.Explicatus, kapitel.localId) ?? chapter;
      walk(kapitel, nextChapter);
    }

    for (const paragraf of asArray<Record<string, unknown>>(objectNode.Paragraf as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
      const section =
        (typeof paragraf.localId === 'string' && paragraf.localId.trim())
          ? paragraf.localId.trim()
          : parseSectionFromExplicatus(paragraf.Explicatus);

      if (!section) {
        walk(paragraf, chapter);
        continue;
      }

      const title = normalizeWhitespace(extractText(paragraf.Rubrica));
      const content = normalizeWhitespace(extractText(paragraf));
      if (!content) {
        walk(paragraf, chapter);
        continue;
      }

      provisions.push({
        provision_ref: chapter ? `${chapter}:${section}` : section,
        chapter,
        section,
        title: title || undefined,
        content,
      });

      walk(paragraf, chapter);
    }

    for (const [key, value] of Object.entries(objectNode)) {
      if (key === 'Kapitel' || key === 'Paragraf') continue;
      walk(value, chapter);
    }
  }

  walk(root, undefined);
  return dedupeProvisions(provisions);
}

function buildDefaultOutputPath(seedId: string): string {
  if (/^\d{4}:\d+$/u.test(seedId)) {
    return path.join(DEFAULT_SEED_DIR, `${seedId.replace(':', '_')}.json`);
  }

  return path.join(DEFAULT_SEED_DIR, `${toAsciiKey(seedId)}.json`);
}

export async function ingest(identifier: string, outputPath?: string): Promise<void> {
  console.log('Retsinformation Ingestion');
  console.log(`  Identifier: ${identifier}`);

  const remoteDoc = await resolveDocument(identifier);
  const href = remoteDoc.href ? normalizeHref(remoteDoc.href) : undefined;

  if (!href) {
    throw new Error(`No XML href found for identifier "${identifier}"`);
  }

  console.log(`  XML source: ${href}`);

  const xml = await fetchText(href);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    trimValues: true,
  });

  const parsed = parser.parse(xml) as Record<string, unknown>;
  const documentNode = parsed.Dokument as Record<string, unknown> | undefined;
  if (!documentNode) {
    throw new Error('Unexpected XML payload: missing Dokument root');
  }

  const meta = documentNode.Meta as Record<string, unknown> | undefined;
  if (!meta) {
    throw new Error('Unexpected XML payload: missing Dokument.Meta');
  }

  const title = normalizeWhitespace(extractText(meta.DocumentTitle)) || 'Untitled Retsinformation document';
  const shortName = normalizeWhitespace(extractText(meta.DocumentType));
  const issuedDate = parseIsoDate(meta.DiesSigni);
  const startDate = parseIsoDate(meta.StartDate);
  const endDate = parseIsoDate(meta.EndDate);
  const documentId = normalizeWhitespace(extractText(meta.DocumentId)) || remoteDoc.documentId || 'unknown';
  const accession = normalizeWhitespace(extractText(meta.AccessionNumber)) || remoteDoc.accessionsnummer || identifier;
  const seedId = inferId(meta.Year, meta.Number, documentId);

  const provisions = collectProvisions(documentNode);
  const definitions = extractDefinitions(provisions);

  const provisionVersions = provisions.map((p): ProvisionVersionSeed => ({
    ...p,
    valid_from: startDate ?? issuedDate ?? null,
    valid_to: endDate ?? null,
  }));

  const seed: SeedOutput = {
    id: seedId,
    type: inferType(shortName),
    title,
    title_en: undefined,
    short_name: shortName || undefined,
    status: inferStatus(meta.Status, startDate, endDate),
    issued_date: issuedDate,
    in_force_date: startDate,
    url: href,
    description: normalizeWhitespace(
      `Retsinformation source. DocumentId=${documentId}; AccessionNumber=${accession}; Characters preserved in NFC; ASCII fallback used only for key/file generation.`,
    ),
    provisions,
    provision_versions: provisionVersions,
    definitions,
  };

  const finalOutputPath = outputPath
    ? path.resolve(PROJECT_ROOT, outputPath)
    : buildDefaultOutputPath(seedId);

  fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true });
  fs.writeFileSync(finalOutputPath, `${JSON.stringify(seed, null, 2)}\n`, 'utf-8');

  console.log(`  Provisions extracted: ${seed.provisions.length}`);
  console.log(`  Definitions extracted: ${seed.definitions.length}`);
  console.log(`  Seed file written: ${path.relative(PROJECT_ROOT, finalOutputPath)}`);
}

async function main(): Promise<void> {
  const [, , identifier, outputPath] = process.argv;

  if (!identifier) {
    console.error('Usage: npm run ingest -- <documentId|accession|xml-url> [output-path]');
    process.exit(1);
  }

  await ingest(identifier, outputPath);
}

const isDirectRun = (() => {
  const scriptArg = process.argv[1];
  if (!scriptArg) return false;
  return pathToFileURL(path.resolve(scriptArg)).href === import.meta.url;
})();

if (isDirectRun) {
  main().catch(error => {
    console.error(`Ingestion failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
