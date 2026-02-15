import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from '@ansvar/mcp-sqlite';
import { getProvision } from '../../src/tools/get-provision.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('get_provision', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('should get a specific provision by chapter and section', async () => {
    const response = await getProvision(db, {
      document_id: '2018:218',
      chapter: '1',
      section: '1',
    });

    expect(response.results).not.toBeNull();
    expect(response.results).not.toBeInstanceOf(Array);
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.provision_ref).toBe('1:1');
    expect(prov.content).toContain('dataskyddsförordning');
    expect(prov.title).toBe('Lagens syfte');
  });

  it('should get a provision by provision_ref directly', async () => {
    const response = await getProvision(db, {
      document_id: '2018:218',
      provision_ref: '3:1',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.provision_ref).toBe('3:1');
    expect(prov.title).toBe('Tillsynsmyndighet');
  });

  it('should get a flat statute provision', async () => {
    const response = await getProvision(db, {
      document_id: '1998:204',
      section: '5 a',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.provision_ref).toBe('5 a');
    expect(prov.title).toBe('Missbruksregeln');
    expect(prov.content).toContain('personuppgifter');
  });

  it('should return all provisions when no specific one requested', async () => {
    const response = await getProvision(db, { document_id: '2018:218' });

    expect(Array.isArray(response.results)).toBe(true);
    const provisions = response.results as Array<unknown>;
    expect(provisions.length).toBe(8); // 8 sample provisions for 2018:218
  });

  it('should return null for non-existent provision', async () => {
    const response = await getProvision(db, {
      document_id: '2018:218',
      provision_ref: '99:99',
    });

    expect(response.results).toBeNull();
  });

  it('should include cross-references', async () => {
    const response = await getProvision(db, {
      document_id: '2018:218',
      provision_ref: '1:1',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.cross_references).toBeDefined();
    expect(prov.cross_references.length).toBeGreaterThan(0);
  });

  it('should throw for missing document_id', async () => {
    await expect(
      getProvision(db, { document_id: '' })
    ).rejects.toThrow('document_id is required');
  });

  it('should return historical text when as_of_date is provided', async () => {
    const response = await getProvision(db, {
      document_id: '2018:218',
      provision_ref: '3:1',
      as_of_date: '2019-06-01',
    });

    expect(response.results).not.toBeNull();
    const prov = response.results as Exclude<typeof response.results, null | Array<unknown>>;
    expect(prov.content).toContain('Datainspektionen');
    expect(prov.valid_to).toBe('2021-01-01');
  });

  it('should return null when provision is outside historical validity window', async () => {
    const response = await getProvision(db, {
      document_id: '1998:204',
      provision_ref: '1',
      as_of_date: '2020-01-01',
    });

    expect(response.results).toBeNull();
  });
});
