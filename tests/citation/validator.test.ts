import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from '@ansvar/mcp-sqlite';
import { validateCitation } from '../../src/citation/validator.js';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';

describe('validateCitation', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  describe('valid citations', () => {
    it('should validate an existing statute', () => {
      const result = validateCitation(db, 'SFS 2018:218');
      expect(result.document_exists).toBe(true);
      expect(result.provision_exists).toBe(true); // no provision specified, so N/A
      expect(result.document_title).toContain('dataskyddsförordning');
      expect(result.warnings).toHaveLength(0);
    });

    it('should validate a specific provision', () => {
      const result = validateCitation(db, 'SFS 2018:218 1 kap. 1 §');
      expect(result.document_exists).toBe(true);
      expect(result.provision_exists).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should validate a flat statute provision', () => {
      const result = validateCitation(db, '1998:204 3 §');
      expect(result.document_exists).toBe(true);
      expect(result.provision_exists).toBe(true);
    });
  });

  describe('warnings', () => {
    it('should warn about repealed statute', () => {
      const result = validateCitation(db, '1998:204');
      expect(result.document_exists).toBe(true);
      expect(result.warnings.some(w => w.includes('repealed'))).toBe(true);
    });

    it('should warn about non-existent provision', () => {
      const result = validateCitation(db, 'SFS 2018:218 99 kap. 99 §');
      expect(result.document_exists).toBe(true);
      expect(result.provision_exists).toBe(false);
      expect(result.warnings.some(w => w.includes('not found'))).toBe(true);
    });
  });

  describe('non-existent documents', () => {
    it('should report missing document', () => {
      const result = validateCitation(db, 'SFS 9999:999');
      expect(result.document_exists).toBe(false);
      expect(result.provision_exists).toBe(false);
      expect(result.warnings.some(w => w.includes('not found'))).toBe(true);
    });
  });

  describe('invalid format', () => {
    it('should report invalid citation format', () => {
      const result = validateCitation(db, 'not a citation');
      expect(result.document_exists).toBe(false);
      expect(result.citation.valid).toBe(false);
    });

    it('should handle empty input', () => {
      const result = validateCitation(db, '');
      expect(result.document_exists).toBe(false);
      expect(result.citation.valid).toBe(false);
    });
  });
});
