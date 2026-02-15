import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from '@ansvar/mcp-sqlite';
import { checkCurrency } from '../../src/tools/check-currency.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('check_currency', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should return currency info for in-force statute', async () => {
    const response = await checkCurrency(db, { document_id: '2018:218' });

    expect(response.results).not.toBeNull();
    expect(response.results!.document_id).toBe('2018:218');
    expect(response.results!.status).toBe('in_force');
    expect(response.results!.is_current).toBe(true);
    expect(response.results!.warnings).toHaveLength(0);
  });

  it('should warn about repealed statute', async () => {
    const response = await checkCurrency(db, { document_id: '1998:204' });

    expect(response.results).not.toBeNull();
    expect(response.results!.status).toBe('repealed');
    expect(response.results!.is_current).toBe(false);
    expect(response.results!.warnings.some(w => w.includes('repealed'))).toBe(true);
  });

  it('should check provision existence', async () => {
    const response = await checkCurrency(db, {
      document_id: '2018:218',
      provision_ref: '1:1',
    });

    expect(response.results).not.toBeNull();
    expect(response.results!.provision_exists).toBe(true);
  });

  it('should warn about non-existent provision', async () => {
    const response = await checkCurrency(db, {
      document_id: '2018:218',
      provision_ref: '99:99',
    });

    expect(response.results).not.toBeNull();
    expect(response.results!.provision_exists).toBe(false);
    expect(response.results!.warnings.some(w => w.includes('not found'))).toBe(true);
  });

  it('should return null for non-existent document', async () => {
    const response = await checkCurrency(db, { document_id: '9999:999' });
    expect(response.results).toBeNull();
  });

  it('should throw for missing document_id', async () => {
    await expect(
      checkCurrency(db, { document_id: '' })
    ).rejects.toThrow('document_id is required');
  });

  it('should compute historical status for as_of_date', async () => {
    const response = await checkCurrency(db, {
      document_id: '1998:204',
      as_of_date: '2007-01-01',
    });

    expect(response.results).not.toBeNull();
    expect(response.results!.status_as_of).toBe('in_force');
    expect(response.results!.is_in_force_as_of).toBe(true);
  });

  it('should compute historical repeal for as_of_date after repeal date', async () => {
    const response = await checkCurrency(db, {
      document_id: '1998:204',
      as_of_date: '2020-01-01',
    });

    expect(response.results).not.toBeNull();
    expect(response.results!.status_as_of).toBe('repealed');
    expect(response.results!.is_in_force_as_of).toBe(false);
  });

  it('should not include case_law_stats if sync metadata table does not exist', async () => {
    const response = await checkCurrency(db, { document_id: '2018:218' });

    expect(response.results).not.toBeNull();
    // Test database doesn't have case_law_sync_metadata table, so stats should be undefined
    expect(response.results!.case_law_stats).toBeUndefined();
  });
});
