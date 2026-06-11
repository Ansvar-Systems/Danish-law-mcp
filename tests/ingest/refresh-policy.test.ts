/**
 * Version-keyed refresh decisions (issue #89, ported from Dutch-law-mcp#117).
 *
 * Danish reality (measured 2026-06-10): the sitemap lastmod does NOT track
 * status/metadata changes (2019/241 was historic-marked 2019-07-04 and
 * EndDate-stamped in 2026, lastmod still 2019-03-16), and the harvest API
 * only serves a 10-day window. There is therefore NO cheap upstream signal
 * that can PROVE a stored seed current. The policy refetches whenever
 * freshness is unproven; the only skips are exact: additive-mode skips and
 * same-run resume stamps.
 */
import { describe, it, expect } from 'vitest';
import { decideFetch, stampIngestMeta } from '../../scripts/lib/refresh-policy.js';

const NOW = '2026-06-11T03:00:00Z';
const TODAY = '2026-06-11';

const stamped = {
  retrieved_at: '2026-06-11T01:00:00Z',
  accession: 'A20190024129',
  document_id: 'CK002013',
  unique_document_id: '207970',
  upstream_status: 'Historic',
  start_date: '2019-03-16',
  end_date: '2025-12-23',
  historic_marked: '2019-07-04',
  seed_status: 'repealed' as const,
};

describe('decideFetch', () => {
  it('fetches documents we do not hold', () => {
    expect(decideFetch({ seedExists: false, refresh: false, today: TODAY })).toBe('fetch_new');
    expect(decideFetch({ seedExists: false, refresh: true, today: TODAY })).toBe('fetch_new');
  });

  it('additive mode (no --refresh) skips existing seeds, exactly as before', () => {
    expect(decideFetch({ seedExists: true, refresh: false, today: TODAY })).toBe('skip_existing');
  });

  it('unstamped seeds self-heal unconditionally — the whole 2026-02-15 corpus', () => {
    expect(
      decideFetch({ seedExists: true, refresh: true, existingMeta: null, today: TODAY }),
    ).toBe('refetch_unknown');
    expect(
      decideFetch({ seedExists: true, refresh: true, existingMeta: undefined, today: TODAY }),
    ).toBe('refetch_unknown');
  });

  it('same-run resume: stamp at/after skipStampedSince proves this run already refreshed it', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: stamped,
        skipStampedSince: '2026-06-11T00:00:00Z',
        today: TODAY,
      }),
    ).toBe('skip_current');
  });

  it('a stamp from before skipStampedSince does NOT prove currency', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: stamped,
        skipStampedSince: '2026-06-11T02:00:00Z',
        today: TODAY,
      }),
    ).toBe('refetch_unknown');
  });

  it('stamped in_force whose EndDate has since passed is refetch_changed', () => {
    expect(
      decideFetch({
        seedExists: true,
        refresh: true,
        existingMeta: {
          ...stamped,
          retrieved_at: '2026-03-01T00:00:00Z',
          upstream_status: 'Valid',
          seed_status: 'in_force',
          end_date: '2026-05-01',
        },
        today: TODAY,
      }),
    ).toBe('refetch_changed');
  });

  it('without skipStampedSince a stamp alone cannot prove currency — refetch', () => {
    expect(
      decideFetch({ seedExists: true, refresh: true, existingMeta: stamped, today: TODAY }),
    ).toBe('refetch_unknown');
  });
});

describe('stampIngestMeta', () => {
  it('writes one canonical _ingest shape', () => {
    const out = stampIngestMeta(
      { id: '2019:241', provisions: [] },
      {
        accession: 'A20190024129',
        document_id: 'CK002013',
        unique_document_id: '207970',
        upstream_status: 'Historic',
        start_date: '2019-03-16',
        end_date: '2025-12-23',
        historic_marked: '2019-07-04',
      },
      'repealed',
      NOW,
    );
    expect(out._ingest).toEqual({
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
    expect(out.id).toBe('2019:241');
  });
});
