/**
 * Integration tests for EU cross-reference tools.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from '@ansvar/mcp-sqlite';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import { getEUBasis } from '../../src/tools/get-eu-basis.js';
import { getSwedishImplementations } from '../../src/tools/get-swedish-implementations.js';
import { searchEUImplementations } from '../../src/tools/search-eu-implementations.js';
import { getProvisionEUBasis } from '../../src/tools/get-provision-eu-basis.js';
import { validateEUCompliance } from '../../src/tools/validate-eu-compliance.js';

describe('EU Cross-Reference Tools', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  describe('get_eu_basis', () => {
    it('should return EU basis for DSL (2018:218)', async () => {
      const result = await getEUBasis(db, {
        sfs_number: '2018:218',
      });

      expect(result.results.sfs_number).toBe('2018:218');
      expect(result.results.sfs_title).toContain('dataskyddsförordning');
      expect(result.results.eu_documents).toHaveLength(1);

      const gdpr = result.results.eu_documents[0];
      expect(gdpr.id).toBe('regulation:2016/679');
      expect(gdpr.type).toBe('regulation');
      expect(gdpr.short_name).toBe('GDPR');
      expect(gdpr.is_primary_implementation).toBe(true);
      expect(gdpr.reference_type).toBe('supplements');

      expect(result.results.statistics.total_eu_references).toBe(1);
      expect(result.results.statistics.regulation_count).toBe(1);
      expect(result.results.statistics.directive_count).toBe(0);
    });

    it('should include articles when requested', async () => {
      const result = await getEUBasis(db, {
        sfs_number: '2018:218',
        include_articles: true,
      });

      const gdpr = result.results.eu_documents[0];
      expect(gdpr.articles).toBeDefined();
      expect(gdpr.articles?.length).toBeGreaterThan(0);
    });

    it('should return EU basis for repealed PUL (1998:204)', async () => {
      const result = await getEUBasis(db, {
        sfs_number: '1998:204',
      });

      expect(result.results.sfs_number).toBe('1998:204');
      expect(result.results.eu_documents).toHaveLength(1);

      const directive = result.results.eu_documents[0];
      expect(directive.id).toBe('directive:95/46');
      expect(directive.type).toBe('directive');
      expect(directive.is_primary_implementation).toBe(true);
      expect(directive.reference_type).toBe('implements');
    });

    it('should throw error for invalid SFS number format', async () => {
      await expect(
        getEUBasis(db, { sfs_number: 'invalid' })
      ).rejects.toThrow('Invalid SFS number format');
    });

    it('should throw error for non-existent statute', async () => {
      await expect(
        getEUBasis(db, { sfs_number: '9999:999' })
      ).rejects.toThrow('not found in database');
    });
  });

  describe('get_swedish_implementations', () => {
    it('should return Swedish implementations of GDPR', async () => {
      const result = await getSwedishImplementations(db, {
        eu_document_id: 'regulation:2016/679',
      });

      expect(result.results.eu_document.id).toBe('regulation:2016/679');
      expect(result.results.eu_document.short_name).toBe('GDPR');
      expect(result.results.implementations).toHaveLength(1);

      const dsl = result.results.implementations[0];
      expect(dsl.sfs_number).toBe('2018:218');
      expect(dsl.short_name).toBe('DSL');
      expect(dsl.status).toBe('in_force');
      expect(dsl.is_primary_implementation).toBe(true);
      expect(dsl.reference_type).toBe('supplements');
      expect(dsl.implementation_status).toBe('complete');

      expect(result.results.statistics.total_statutes).toBe(1);
      expect(result.results.statistics.primary_implementations).toBe(1);
      expect(result.results.statistics.in_force).toBe(1);
    });

    it('should return Swedish implementations of Data Protection Directive', async () => {
      const result = await getSwedishImplementations(db, {
        eu_document_id: 'directive:95/46',
      });

      expect(result.results.implementations).toHaveLength(1);

      const pul = result.results.implementations[0];
      expect(pul.sfs_number).toBe('1998:204');
      expect(pul.status).toBe('repealed');
      expect(pul.is_primary_implementation).toBe(true);
    });

    it('should filter by in_force_only', async () => {
      const result = await getSwedishImplementations(db, {
        eu_document_id: 'directive:95/46',
        in_force_only: true,
      });

      // PUL is repealed, so should return empty
      expect(result.results.implementations).toHaveLength(0);
    });

    it('should filter by primary_only', async () => {
      const result = await getSwedishImplementations(db, {
        eu_document_id: 'regulation:2016/679',
        primary_only: true,
      });

      expect(result.results.implementations).toHaveLength(1);
      expect(result.results.implementations[0].is_primary_implementation).toBe(true);
    });

    it('should throw error for invalid EU document ID', async () => {
      await expect(
        getSwedishImplementations(db, { eu_document_id: 'invalid' })
      ).rejects.toThrow('Invalid EU document ID format');
    });

    it('should throw error for non-existent EU document', async () => {
      await expect(
        getSwedishImplementations(db, { eu_document_id: 'directive:9999/999' })
      ).rejects.toThrow('not found in database');
    });
  });

  describe('search_eu_implementations', () => {
    it('should search EU documents by keyword', async () => {
      const result = await searchEUImplementations(db, {
        query: 'data protection',
      });

      expect(result.results.results.length).toBeGreaterThan(0);
      const found = result.results.results.some(
        r => r.eu_document.short_name === 'GDPR' || r.eu_document.id === 'directive:95/46'
      );
      expect(found).toBe(true);
    });

    it('should filter by type', async () => {
      const result = await searchEUImplementations(db, {
        type: 'regulation',
      });

      expect(result.results.results).toHaveLength(1);
      expect(result.results.results[0].eu_document.type).toBe('regulation');
      expect(result.results.results[0].eu_document.id).toBe('regulation:2016/679');
    });

    it('should filter by year range', async () => {
      const result = await searchEUImplementations(db, {
        year_from: 2010,
        year_to: 2020,
      });

      expect(result.results.results).toHaveLength(1);
      expect(result.results.results[0].eu_document.year).toBe(2016);
    });

    it('should filter by has_swedish_implementation', async () => {
      const result = await searchEUImplementations(db, {
        has_swedish_implementation: true,
      });

      expect(result.results.results.length).toBeGreaterThan(0);
      for (const item of result.results.results) {
        expect(item.swedish_statute_count).toBeGreaterThan(0);
      }
    });

    it('should show Swedish statute counts', async () => {
      const result = await searchEUImplementations(db, {
        query: 'GDPR',
      });

      const gdpr = result.results.results.find(r => r.eu_document.id === 'regulation:2016/679');
      expect(gdpr).toBeDefined();
      expect(gdpr!.swedish_statute_count).toBeGreaterThan(0);
      expect(gdpr!.primary_implementations).toContain('2018:218');
    });

    it('should respect limit parameter', async () => {
      const result = await searchEUImplementations(db, {
        limit: 1,
      });

      expect(result.results.results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('get_provision_eu_basis', () => {
    it('should return EU basis for DSL 2:1', async () => {
      const result = await getProvisionEUBasis(db, {
        sfs_number: '2018:218',
        provision_ref: '2:1',
      });

      expect(result.results.sfs_number).toBe('2018:218');
      expect(result.results.provision_ref).toBe('2:1');
      expect(result.results.provision_content).toContain('artikel 6.1 e');
      expect(result.results.eu_references).toHaveLength(1);

      const ref = result.results.eu_references[0];
      expect(ref.id).toBe('regulation:2016/679');
      expect(ref.article).toBe('6.1.e');
      expect(ref.reference_type).toBe('cites_article');
    });

    it('should return EU basis for DSL 2:2', async () => {
      const result = await getProvisionEUBasis(db, {
        sfs_number: '2018:218',
        provision_ref: '2:2',
      });

      expect(result.results.eu_references).toHaveLength(1);
      const ref = result.results.eu_references[0];
      expect(ref.article).toBe('9.2.g');
    });

    it('should return EU basis for DSL 3:2 (multiple articles)', async () => {
      const result = await getProvisionEUBasis(db, {
        sfs_number: '2018:218',
        provision_ref: '3:2',
      });

      expect(result.results.eu_references).toHaveLength(1);
      const ref = result.results.eu_references[0];
      expect(ref.article).toBe('83,84');
    });

    it('should return empty for provision without EU references', async () => {
      const result = await getProvisionEUBasis(db, {
        sfs_number: '2018:218',
        provision_ref: '1:1',
      });

      // 1:1 is a document-level reference, not provision-level
      expect(result.results.eu_references).toHaveLength(0);
    });

    it('should throw error for invalid provision', async () => {
      await expect(
        getProvisionEUBasis(db, {
          sfs_number: '2018:218',
          provision_ref: '99:99',
        })
      ).rejects.toThrow('not found in database');
    });
  });

  describe('validate_eu_compliance', () => {
    it('should validate compliant statute (DSL)', async () => {
      const result = await validateEUCompliance(db, {
        sfs_number: '2018:218',
      });

      expect(result.results.sfs_number).toBe('2018:218');
      expect(result.results.compliance_status).toBe('compliant');
      expect(result.results.eu_references_found).toBeGreaterThan(0);
      expect(result.results.warnings).toHaveLength(0);
    });

    it('should detect repealed EU directive (PUL)', async () => {
      const result = await validateEUCompliance(db, {
        sfs_number: '1998:204',
      });

      expect(result.results.compliance_status).toBe('partial');
      expect(result.results.warnings.length).toBeGreaterThan(0);
      expect(result.results.outdated_references).toBeDefined();
      expect(result.results.outdated_references?.length).toBeGreaterThan(0);

      const outdated = result.results.outdated_references![0];
      expect(outdated.eu_document_id).toBe('directive:95/46');
      expect(outdated.replaced_by).toBe('regulation:2016/679');
    });

    it('should return not_applicable for statute without EU references', async () => {
      // Create a test statute without EU references
      db.prepare(`
        INSERT INTO legal_documents (id, type, title, status)
        VALUES ('2020:999', 'statute', 'Test Statute', 'in_force')
      `).run();

      const result = await validateEUCompliance(db, {
        sfs_number: '2020:999',
      });

      expect(result.results.compliance_status).toBe('not_applicable');
      expect(result.results.eu_references_found).toBe(0);
      expect(result.results.recommendations).toBeDefined();

      // Clean up
      db.prepare('DELETE FROM legal_documents WHERE id = ?').run('2020:999');
    });

    it('should validate specific provision', async () => {
      const result = await validateEUCompliance(db, {
        sfs_number: '2018:218',
        provision_ref: '2:1',
      });

      expect(result.results.provision_ref).toBe('2:1');
      expect(result.results.eu_references_found).toBeGreaterThan(0);
    });

    it('should validate against specific EU document', async () => {
      const result = await validateEUCompliance(db, {
        sfs_number: '2018:218',
        eu_document_id: 'regulation:2016/679',
      });

      expect(result.results.eu_references_found).toBeGreaterThan(0);
    });

    it('should throw error for invalid statute', async () => {
      await expect(
        validateEUCompliance(db, { sfs_number: '9999:999' })
      ).rejects.toThrow('not found in database');
    });
  });

  describe('Metadata', () => {
    it('should include metadata in all tool responses', async () => {
      const result = await getEUBasis(db, { sfs_number: '2018:218' });

      expect(result._metadata).toBeDefined();
      expect(result._metadata.disclaimer).toContain('NOT LEGAL ADVICE');
      expect(result._metadata.data_freshness).toBeDefined();
      expect(result._metadata.source_authority).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should execute get_eu_basis in <100ms', async () => {
      const start = Date.now();
      await getEUBasis(db, { sfs_number: '2018:218' });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should execute get_swedish_implementations in <100ms', async () => {
      const start = Date.now();
      await getSwedishImplementations(db, { eu_document_id: 'regulation:2016/679' });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should execute search_eu_implementations in <100ms', async () => {
      const start = Date.now();
      await searchEUImplementations(db, { query: 'data' });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
