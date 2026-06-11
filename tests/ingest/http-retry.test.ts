/**
 * Transient-vs-gone separation (issue #89, ported from Dutch-law-mcp#117).
 *
 * Transient failures (5xx, 429, network) retry with backoff and then THROW —
 * they must never be soft-failed into "document gone". A 404 is returned to
 * the caller: gone requires positive evidence and the caller decides.
 */
import { describe, it, expect } from 'vitest';
import { fetchWithRetry } from '../../scripts/lib/http-retry.js';

const FAST = { attempts: 3, backoffMs: [1, 1] };

function fakeFetch(responses: Array<number | Error>): { impl: typeof fetch; calls: () => number } {
  let i = 0;
  const impl = (async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return new Response('x', { status: r });
  }) as unknown as typeof fetch;
  return { impl, calls: () => i };
}

describe('fetchWithRetry', () => {
  it('returns an ok response immediately', async () => {
    const f = fakeFetch([200]);
    const res = await fetchWithRetry('https://example.test/doc', { fetchImpl: f.impl, ...FAST });
    expect(res.status).toBe(200);
    expect(f.calls()).toBe(1);
  });

  it('retries 5xx then succeeds', async () => {
    const f = fakeFetch([503, 200]);
    const res = await fetchWithRetry('https://example.test/doc', { fetchImpl: f.impl, ...FAST });
    expect(res.status).toBe(200);
    expect(f.calls()).toBe(2);
  });

  it('retries network errors then THROWS after the attempt budget', async () => {
    const f = fakeFetch([new Error('ECONNRESET')]);
    await expect(
      fetchWithRetry('https://example.test/doc', { fetchImpl: f.impl, ...FAST }),
    ).rejects.toThrow(/failed after 3 attempts/);
    expect(f.calls()).toBe(3);
  });

  it('retries 429 then THROWS — rate limiting is never "gone"', async () => {
    const f = fakeFetch([429]);
    await expect(
      fetchWithRetry('https://example.test/doc', { fetchImpl: f.impl, ...FAST }),
    ).rejects.toThrow(/HTTP 429/);
    expect(f.calls()).toBe(3);
  });

  it('returns 404 to the caller without retrying — gone is a finding, not an error', async () => {
    const f = fakeFetch([404]);
    const res = await fetchWithRetry('https://example.test/doc', { fetchImpl: f.impl, ...FAST });
    expect(res.status).toBe(404);
    expect(f.calls()).toBe(1);
  });

  it('retries respect a per-upstream pacing floor — backoff below the politeness floor is raised to it (PR #90 round 2)', async () => {
    // The default backoff ladder starts at 1s; against retsinformation.dk the
    // promised floor is 2s start-to-start INCLUDING retries. minDelayMs lifts
    // every inter-attempt sleep to the floor.
    const starts: number[] = [];
    let i = 0;
    const impl = (async () => {
      starts.push(performance.now());
      i += 1;
      return new Response('x', { status: i < 3 ? 503 : 200 });
    }) as unknown as typeof fetch;

    const res = await fetchWithRetry('https://example.test/doc', {
      fetchImpl: impl,
      attempts: 3,
      backoffMs: [1, 1],
      minDelayMs: 200,
    });
    expect(res.status).toBe(200);
    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(190);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(190);
  });
});
