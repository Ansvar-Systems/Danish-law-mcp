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
import {
  extractVersionIdentity,
  isoDateOf,
  mapSeedStatus,
  type VersionIdentity,
  type SeedStatus,
} from './lib/version-identity.js';
import { stampIngestMeta, type SeedIngestMeta } from './lib/refresh-policy.js';
import { fetchWithRetry } from './lib/http-retry.js';
import { writeFileAtomic } from './lib/atomic-write.js';

/**
 * Positive evidence that the document is gone upstream (HTTP 404/410).
 * Distinct from transient failures, which retry and then THROW a plain
 * Error — a flaky network must never be classified as "document gone".
 */
export class GoneUpstreamError extends Error {
  readonly httpStatus: number;
  constructor(url: string, httpStatus: number) {
    super(`document gone upstream: HTTP ${httpStatus} for ${url}`);
    this.name = 'GoneUpstreamError';
    this.httpStatus = httpStatus;
  }
}

/**
 * The URL served a document with a different identity than the caller
 * expected (PR #90 round 2). Raised BEFORE any seed write — a body for a
 * different document must never be written under the held statute's identity
 * (Dutch-law-mcp ingest-bwb.ts ordering). The expected identity is the HELD
 * seed's id (what we already serve), never a re-derived format.
 */
export class IdentityMismatchError extends Error {
  readonly url: string;
  readonly servedId: string;
  readonly expectedId: string;
  constructor(url: string, servedId: string, expectedId: string) {
    super(
      `identity mismatch: URL ${url} served document "${servedId}" but the held identity is ` +
        `"${expectedId}" — refusing to write a different document's body under this seed`,
    );
    this.name = 'IdentityMismatchError';
    this.url = url;
    this.servedId = servedId;
    this.expectedId = expectedId;
  }
}

export interface IngestOptions {
  fetchImpl?: typeof fetch;
  /** ISO timestamp stamped as _ingest.retrieved_at; defaults to now. */
  now?: string;
  /** ISO 'YYYY-MM-DD' used for status date logic; defaults to today. */
  today?: string;
  /**
   * The identity the caller expects the URL to serve (the held seed's id).
   * On mismatch ingest() throws IdentityMismatchError before any write.
   */
  expectedId?: string;
}

export interface IngestResult {
  seedId: string;
  outputPath: string;
  status: SeedStatus;
  identity: VersionIdentity;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SEED_DIR = path.join(PROJECT_ROOT, 'data', 'seed');

const API_BASE = 'https://api.retsinformation.dk/v1';
const USER_AGENT = 'Danish-Law-MCP/1.0.0 (https://github.com/Ansvar-Systems/Denmark-law-mcp)';
/**
 * Politeness floor for retsinformation.dk: >= 2s start-to-start INCLUDING
 * retries (the default backoff ladder starts at 1s and would re-hit a
 * throttling upstream too fast).
 */
const RETRY_PACING_FLOOR_MS = 2_000;

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

async function fetchJson<T>(url: string, fetchImpl?: typeof fetch): Promise<T> {
  const response = await fetchWithRetry(url, {
    fetchImpl,
    minDelayMs: RETRY_PACING_FLOOR_MS,
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

/**
 * Fetch a document XML payload. Transient failures retry and then THROW
 * (plain Error); HTTP 404/410 raise GoneUpstreamError — the only statuses
 * that count as positive gone-evidence.
 */
async function fetchDocumentXml(url: string, fetchImpl?: typeof fetch): Promise<string> {
  const response = await fetchWithRetry(url, {
    fetchImpl,
    minDelayMs: RETRY_PACING_FLOOR_MS,
    headers: {
      Accept: 'application/xml,text/xml,*/*',
      'User-Agent': USER_AGENT,
    },
  });

  if (response.status === 404 || response.status === 410) {
    throw new GoneUpstreamError(url, response.status);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
}

async function resolveDocument(identifier: string, fetchImpl?: typeof fetch): Promise<RemoteDocument> {
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
    return await fetchJson<RemoteDocument>(
      `${API_BASE}/Documents/${encodeURIComponent(identifier)}`,
      fetchImpl,
    );
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

export async function ingest(
  identifier: string,
  outputPath?: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const now = opts.now ?? new Date().toISOString();
  const today = opts.today ?? now.slice(0, 10);

  console.log('Retsinformation Ingestion');
  console.log(`  Identifier: ${identifier}`);

  const remoteDoc = await resolveDocument(identifier, opts.fetchImpl);
  const href = remoteDoc.href ? normalizeHref(remoteDoc.href) : undefined;

  if (!href) {
    throw new Error(`No XML href found for identifier "${identifier}"`);
  }

  console.log(`  XML source: ${href}`);

  const xml = await fetchDocumentXml(href, opts.fetchImpl);

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
  // Attribute-tolerant like every other date field: <DiesSigni REFid=...>
  // parses to an object and the old string-only parser yielded undefined.
  const issuedDate = isoDateOf(meta.DiesSigni) ?? undefined;
  const documentId = normalizeWhitespace(extractText(meta.DocumentId)) || remoteDoc.documentId || 'unknown';
  const seedId = inferId(meta.Year, meta.Number, documentId);

  // Identity gate BEFORE anything else (PR #90 round 2): a body for a
  // different document must never be written under the held statute's
  // identity. Checked before status mapping so a redirect surprise reports
  // as what it is, not as unknown vocabulary.
  if (opts.expectedId !== undefined && seedId !== opts.expectedId) {
    throw new IdentityMismatchError(href, seedId, opts.expectedId);
  }

  // Version identity of the served consolidation (issue #89). Status mapping
  // is explicit and THROWS on unknown vocabulary — no seed is written then.
  const identity = extractVersionIdentity(meta);
  if (!identity.document_id) identity.document_id = documentId;
  if (!identity.accession && remoteDoc.accessionsnummer && remoteDoc.accessionsnummer !== identifier) {
    identity.accession = remoteDoc.accessionsnummer;
  }
  const status = mapSeedStatus(identity, today);
  const startDate = identity.start_date ?? undefined;
  const endDate = identity.end_date ?? undefined;
  const accession = identity.accession ?? identifier;

  const provisions = collectProvisions(documentNode);
  const definitions = extractDefinitions(provisions);

  // valid_to only when validity actually ended (repealed): <EndDate> on a
  // Valid document is the amended-through marker, not a validity end.
  const validityEnd = status === 'repealed' ? identity.historic_marked ?? endDate ?? null : null;

  const provisionVersions = provisions.map((p): ProvisionVersionSeed => ({
    ...p,
    valid_from: startDate ?? issuedDate ?? null,
    valid_to: validityEnd,
  }));

  // 'Ophævet <date>' is parsed by build-db.ts deriveDocumentValidityWindow
  // to set the document validity end for superseded consolidations.
  const repealNote = status === 'repealed' && validityEnd ? ` Ophævet ${validityEnd}.` : '';

  const seedBody: SeedOutput = {
    id: seedId,
    type: inferType(shortName),
    title,
    title_en: undefined,
    short_name: shortName || undefined,
    status,
    issued_date: issuedDate,
    in_force_date: startDate,
    url: href,
    description: normalizeWhitespace(
      `Retsinformation source. DocumentId=${documentId}; AccessionNumber=${accession};${repealNote} Characters preserved in NFC; ASCII fallback used only for key/file generation.`,
    ),
    provisions,
    provision_versions: provisionVersions,
    definitions,
  };

  const seed: SeedOutput & { _ingest: SeedIngestMeta } = stampIngestMeta(seedBody, identity, status, now);

  const finalOutputPath = outputPath
    ? path.resolve(PROJECT_ROOT, outputPath)
    : buildDefaultOutputPath(seedId);

  fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true });
  // Atomic replace: a kill mid-write must never destroy the held good seed
  // or leave torn JSON (PR #90 round 2).
  writeFileAtomic(finalOutputPath, `${JSON.stringify(seed, null, 2)}\n`);

  console.log(`  Provisions extracted: ${seed.provisions.length}`);
  console.log(`  Definitions extracted: ${seed.definitions.length}`);
  console.log(`  Status: ${status} (upstream: ${identity.upstream_status ?? 'n/a'}, end: ${identity.end_date ?? 'open'})`);
  console.log(`  Seed file written: ${path.relative(PROJECT_ROOT, finalOutputPath)}`);

  return { seedId, outputPath: finalOutputPath, status, identity };
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
