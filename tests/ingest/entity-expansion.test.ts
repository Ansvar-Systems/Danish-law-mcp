/**
 * Entity-expansion headroom (2026-06-12 sweep finding): 10 large modern acts
 * (2017_1289, 2020_1005, ...) failed ingest with "Entity expansion limit
 * exceeded: 1001 > 1000" — fast-xml-parser's default total-expansion cap is
 * far below what legitimate Danish law XML carries in plain &amp;/&lt;
 * escapes. The cap is raised; the guards that actually stop billion-laughs
 * payloads (expansion DEPTH, per-entity size) stay strict.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ingest } from '../../scripts/ingest-retsinformation.js';

function bigEntityDocXml(paragraphCount: number): string {
  // Each paragraph carries several &lt;/&gt; escapes — the entity class
  // fast-xml-parser actually COUNTS toward maxTotalExpansions (&amp; and
  // numeric refs are replaced uncounted; verified empirically against
  // the real 2017/1289 document, which carries 1,927 &lt;/&gt;).
  const paragraphs = Array.from({ length: paragraphCount }, (_, i) => `
    <Paragraf localId="${i + 1}">
      <Explicatus>§ ${i + 1}</Explicatus>
      <Char>Hvis x &lt; y og y &gt; z, jf. &lt;bilag 1&gt;, skal oplysninger indberettes.</Char>
    </Paragraf>`).join('');
  return `<?xml version="1.0" encoding="utf-8"?>
<Dokument id="d1">
  <Meta id="m1">
    <DocumentType>LBK H#LOKDOK03</DocumentType>
    <AccessionNumber>A20170128929</AccessionNumber>
    <DocumentId>CK999001</DocumentId>
    <UniqueDocumentId>999001</UniqueDocumentId>
    <DocumentTitle>Bekendtgørelse af stor lov med mange escapes</DocumentTitle>
    <Year>2017</Year>
    <Number>1289</Number>
    <DiesSigni>2017-12-01</DiesSigni>
    <Status>Valid</Status>
  </Meta>
  <Kapitel localId="1">
    <Explicatus>Kapitel 1</Explicatus>${paragraphs}
  </Kapitel>
</Dokument>`;
}

function fetchServing(body: string): typeof fetch {
  return (async () =>
    new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } })) as unknown as typeof fetch;
}

describe('entity-expansion headroom for large statutes', () => {
  it('ingests a document with >1,000 legitimate entity escapes (the 2026-06-12 sweep failure class)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-entity-test-'));
    const outputPath = path.join(dir, '2017_1289.json');
    // 400 paragraphs × 4 counted escapes each = 1,600 expansions — over the
    // old 1,000 cap (the real 2017/1289 fails at expansion 1,001).
    const xml = bigEntityDocXml(400);

    await ingest('https://www.retsinformation.dk/eli/lta/2017/1289/xml', outputPath, {
      urlDerivedId: '2017:1289',
      fetchImpl: fetchServing(xml),
    });

    const seed = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(seed.provisions.length).toBe(400);
    expect(seed.provisions[0].content).toContain('Hvis x < y og y > z');
  });
});
