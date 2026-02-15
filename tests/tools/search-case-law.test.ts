import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from '@ansvar/mcp-sqlite';
import { searchCaseLaw } from '../../src/tools/search-case-law.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('search_case_law', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should find case law by keyword', async () => {
    const response = await searchCaseLaw(db, { query: 'personuppgifter' });
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.results[0]).toHaveProperty('document_id');
    expect(response.results[0]).toHaveProperty('court');
    expect(response.results[0]).toHaveProperty('summary_snippet');
  });

  it('should filter by court', async () => {
    const response = await searchCaseLaw(db, {
      query: 'personuppgifter',
      court: 'HD',
    });
    for (const r of response.results) {
      expect(r.court).toBe('HD');
    }
  });

  it('should filter by date range', async () => {
    const response = await searchCaseLaw(db, {
      query: 'personuppgifter',
      date_from: '2020-01-01',
    });
    for (const r of response.results) {
      if (r.decision_date) {
        expect(r.decision_date >= '2020-01-01').toBe(true);
      }
    }
  });

  it('should return empty array for empty query', async () => {
    const response = await searchCaseLaw(db, { query: '' });
    expect(response.results).toEqual([]);
  });

  it('should respect limit', async () => {
    const response = await searchCaseLaw(db, {
      query: 'personuppgifter',
      limit: 1,
    });
    expect(response.results.length).toBeLessThanOrEqual(1);
  });

  it('should include attribution metadata in all results', async () => {
    const response = await searchCaseLaw(db, { query: 'personuppgifter' });
    expect(response.results.length).toBeGreaterThan(0);

    for (const result of response.results) {
      expect(result).toHaveProperty('_metadata');
      expect(result._metadata).toHaveProperty('source');
      expect(result._metadata).toHaveProperty('attribution');
      expect(result._metadata.source).toBe('lagen.nu');
      expect(result._metadata.attribution).toContain('CC-BY Domstolsverket');
    }
  });
});
