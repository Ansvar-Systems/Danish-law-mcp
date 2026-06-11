/**
 * Version-identity extraction + explicit status mapping (issue #89).
 *
 * The 2026-02-15 sweep mapped upstream `<Status>Historic</Status>` to
 * `in_force` because the old inferStatus() silently defaulted every
 * unrecognized status text to in_force. 22,182 of 62,762 seeds carry a
 * fetch-time historic doc-type marker yet claim to be current law.
 * Mapping must be explicit; unknown vocabulary must THROW, never default.
 */
import { describe, it, expect } from 'vitest';
import {
  extractVersionIdentity,
  mapSeedStatus,
  UnknownUpstreamStatusError,
} from '../../scripts/lib/version-identity.js';

const TODAY = '2026-06-10';

describe('extractVersionIdentity', () => {
  it('extracts the served consolidation identity from a parsed Meta node', () => {
    const meta = {
      DocumentType: 'LBK H#LOKDOK03',
      AccessionNumber: 'A20190024129',
      DocumentId: 'CK002013',
      UniqueDocumentId: 207970,
      StartDate: { '#text': '2019-03-16', REFid: 'submit_1' },
      EndDate: { '#text': '2025-12-23', REFid: 'submit_1' },
      Status: 'Historic',
      DateOfHistoricMark: '2019-07-04',
      Year: 2019,
      Number: 241,
    };
    const id = extractVersionIdentity(meta);
    expect(id.accession).toBe('A20190024129');
    expect(id.document_id).toBe('CK002013');
    expect(id.unique_document_id).toBe('207970');
    expect(id.upstream_status).toBe('Historic');
    expect(id.start_date).toBe('2019-03-16');
    expect(id.end_date).toBe('2025-12-23');
    expect(id.historic_marked).toBe('2019-07-04');
  });

  it('returns nulls for absent fields instead of inventing values', () => {
    const id = extractVersionIdentity({});
    expect(id.accession).toBeNull();
    expect(id.end_date).toBeNull();
    expect(id.upstream_status).toBeNull();
  });
});

describe('mapSeedStatus', () => {
  const base = {
    accession: 'A20190024129',
    document_id: 'CK002013',
    unique_document_id: '207970',
    upstream_status: 'Valid',
    start_date: '2019-03-16',
    end_date: null,
    historic_marked: null,
  };

  it('maps Historic to repealed (the 2026-02-15 sweep defect)', () => {
    expect(mapSeedStatus({ ...base, upstream_status: 'Historic' }, TODAY)).toBe('repealed');
  });

  it('maps Historisk (Danish) to repealed', () => {
    expect(mapSeedStatus({ ...base, upstream_status: 'Historisk' }, TODAY)).toBe('repealed');
  });

  it('maps Valid / Gældende to in_force', () => {
    expect(mapSeedStatus({ ...base, upstream_status: 'Valid' }, TODAY)).toBe('in_force');
    expect(mapSeedStatus({ ...base, upstream_status: 'Gældende' }, TODAY)).toBe('in_force');
  });

  it('a past EndDate does NOT override Valid — EndDate is the amended-through marker, not supersession (verified live: kursgevinstloven LBK 2025/1176, Valid, EndDate 2026-01-20, timeline isHistoric=false)', () => {
    expect(
      mapSeedStatus({ ...base, upstream_status: 'Valid', end_date: '2026-01-20' }, TODAY),
    ).toBe('in_force');
  });

  it('a future StartDate on a Valid document means not_yet_in_force', () => {
    expect(
      mapSeedStatus({ ...base, upstream_status: 'Valid', start_date: '2026-09-01' }, TODAY),
    ).toBe('not_yet_in_force');
  });

  it('THROWS on unknown status vocabulary — never silently defaults to in_force', () => {
    expect(() => mapSeedStatus({ ...base, upstream_status: 'Bortfaldet' }, TODAY)).toThrow(
      UnknownUpstreamStatusError,
    );
  });

  it('does not pre-authorize guessed vocabulary never observed upstream (PR #90 round 2)', () => {
    // Observed live (2026-06-10): Valid / Historic. 'gallende' is not a Danish
    // word and 'gaeldende' (ASCII fold) has never been served — accepting them
    // is the same silent-default class issue #89 removed, moved into the
    // accept-set. Unknown must THROW so the operator extends the mapping
    // deliberately.
    expect(() => mapSeedStatus({ ...base, upstream_status: 'Gallende' }, TODAY)).toThrow(
      UnknownUpstreamStatusError,
    );
    expect(() => mapSeedStatus({ ...base, upstream_status: 'Gaeldende' }, TODAY)).toThrow(
      UnknownUpstreamStatusError,
    );
  });

  it('THROWS when status is missing — dates alone prove nothing', () => {
    expect(() => mapSeedStatus({ ...base, upstream_status: null }, TODAY)).toThrow(
      UnknownUpstreamStatusError,
    );
    expect(() =>
      mapSeedStatus({ ...base, upstream_status: null, end_date: '2020-01-01' }, TODAY),
    ).toThrow(UnknownUpstreamStatusError);
  });
});
