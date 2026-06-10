/**
 * ingest() must stamp the served consolidation identity and map status
 * explicitly (issue #89). Proven live before the fix: seed 2019_241 held
 * status in_force while its URL served <Status>Historic</Status> with
 * <EndDate>2025-12-23</EndDate>.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ingest, GoneUpstreamError } from '../../scripts/ingest-retsinformation.js';

const TODAY = '2026-06-10';
const NOW = '2026-06-10T22:00:00Z';

function docXml(opts: { status?: string; endDate?: string; startDate?: string }): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Dokument id="d1">
  <Meta id="m1">
    <DocumentType>LBK H#LOKDOK03</DocumentType>
    <AccessionNumber>A20190024129</AccessionNumber>
    <DocumentId>CK002013</DocumentId>
    <UniqueDocumentId>207970</UniqueDocumentId>
    <DocumentTitle>Bekendtgørelse af lov om miljøbeskyttelse</DocumentTitle>
    <Year>2019</Year>
    <Number>241</Number>
    <DiesSigni>2019-03-13</DiesSigni>
    ${opts.startDate ? `<StartDate>${opts.startDate}</StartDate>` : ''}
    ${opts.endDate ? `<EndDate>${opts.endDate}</EndDate>` : ''}
    ${opts.status ? `<Status>${opts.status}</Status>` : ''}
    <DateOfHistoricMark>2019-07-04</DateOfHistoricMark>
  </Meta>
  <Kapitel localId="1">
    <Explicatus>Kapitel 1</Explicatus>
    <Paragraf localId="1">
      <Explicatus>§ 1</Explicatus>
      <Char>Loven skal medvirke til at værne natur og miljø.</Char>
    </Paragraf>
  </Kapitel>
</Dokument>`;
}

function fetchServing(body: string, status = 200): typeof fetch {
  return (async () =>
    new Response(body, { status, headers: { 'content-type': 'application/xml' } })) as unknown as typeof fetch;
}

function tmpOut(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-ingest-test-'));
  return path.join(dir, 'out.json');
}

describe('ingest version stamping', () => {
  it('stamps _ingest with the served consolidation identity', async () => {
    const out = tmpOut();
    await ingest('https://www.retsinformation.dk/eli/lta/2019/241/xml', out, {
      fetchImpl: fetchServing(docXml({ status: 'Historic', startDate: '2019-03-16', endDate: '2025-12-23' })),
      now: NOW,
      today: TODAY,
    });
    const seed = JSON.parse(fs.readFileSync(out, 'utf-8'));
    expect(seed._ingest).toMatchObject({
      retrieved_at: NOW,
      accession: 'A20190024129',
      document_id: 'CK002013',
      unique_document_id: '207970',
      upstream_status: 'Historic',
      start_date: '2019-03-16',
      end_date: '2025-12-23',
      historic_marked: '2019-07-04',
      seed_status: 'repealed',
    });
  });

  it('maps Historic to repealed and records the historic-mark date as the validity end', async () => {
    const out = tmpOut();
    await ingest('https://www.retsinformation.dk/eli/lta/2019/241/xml', out, {
      fetchImpl: fetchServing(docXml({ status: 'Historic', endDate: '2025-12-23' })),
      now: NOW,
      today: TODAY,
    });
    const seed = JSON.parse(fs.readFileSync(out, 'utf-8'));
    expect(seed.status).toBe('repealed');
    // DateOfHistoricMark (when the successor arrived) beats EndDate (the
    // amended-through marker) as the validity end.
    expect(seed.description).toContain('Ophævet 2019-07-04');
    expect(seed.provision_versions[0].valid_to).toBe('2019-07-04');
  });

  it('does not set a validity end on Valid documents even when EndDate passed', async () => {
    const out = tmpOut();
    await ingest('https://www.retsinformation.dk/eli/lta/2025/1176/xml', out, {
      fetchImpl: fetchServing(docXml({ status: 'Valid', startDate: '2025-10-03', endDate: '2026-01-20' })),
      now: NOW,
      today: TODAY,
    });
    const seed = JSON.parse(fs.readFileSync(out, 'utf-8'));
    expect(seed.status).toBe('in_force');
    expect(seed.description).not.toContain('Ophævet');
    expect(seed.provision_versions[0].valid_to).toBeNull();
  });

  it('keeps Valid documents in_force', async () => {
    const out = tmpOut();
    await ingest('https://www.retsinformation.dk/eli/lta/2019/241/xml', out, {
      fetchImpl: fetchServing(docXml({ status: 'Valid', startDate: '2019-03-16' })),
      now: NOW,
      today: TODAY,
    });
    const seed = JSON.parse(fs.readFileSync(out, 'utf-8'));
    expect(seed.status).toBe('in_force');
    expect(seed.provisions.length).toBeGreaterThan(0);
  });

  it('THROWS on unknown upstream status instead of defaulting to in_force', async () => {
    const out = tmpOut();
    await expect(
      ingest('https://www.retsinformation.dk/eli/lta/2019/241/xml', out, {
        fetchImpl: fetchServing(docXml({ status: 'Bortfaldet' })),
        now: NOW,
        today: TODAY,
      }),
    ).rejects.toThrow(/unknown upstream status/i);
    expect(fs.existsSync(out)).toBe(false); // no seed written on refusal
  });

  it('raises GoneUpstreamError on 404 — positive evidence, distinguishable from transients', async () => {
    const out = tmpOut();
    await expect(
      ingest('https://www.retsinformation.dk/eli/lta/1993/812/xml', out, {
        fetchImpl: fetchServing('not found', 404),
        now: NOW,
        today: TODAY,
      }),
    ).rejects.toThrow(GoneUpstreamError);
  });

  it('returns the ingested identity so bulk callers can verify id expectations', async () => {
    const out = tmpOut();
    const result = await ingest('https://www.retsinformation.dk/eli/lta/2019/241/xml', out, {
      fetchImpl: fetchServing(docXml({ status: 'Valid' })),
      now: NOW,
      today: TODAY,
    });
    expect(result.seedId).toBe('2019:241');
    expect(result.status).toBe('in_force');
    expect(result.identity.accession).toBe('A20190024129');
  });
});
