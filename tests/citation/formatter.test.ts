import { describe, it, expect } from 'vitest';
import { formatCitation, formatProvisionRef } from '../../src/citation/formatter.js';
import type { ParsedCitation } from '../../src/types/index.js';

describe('formatCitation', () => {
  describe('statute - full format', () => {
    it('should format statute with document_id only', () => {
      const citation: ParsedCitation = {
        raw: '2018:218', type: 'statute', document_id: '2018:218', valid: true,
      };
      expect(formatCitation(citation, 'full')).toBe('SFS 2018:218');
    });

    it('should format statute with chapter and section', () => {
      const citation: ParsedCitation = {
        raw: '2018:218 3 kap. 5 §', type: 'statute', document_id: '2018:218',
        chapter: '3', section: '5', valid: true,
      };
      expect(formatCitation(citation, 'full')).toBe('SFS 2018:218 3 kap. 5 §');
    });

    it('should format flat statute (section only)', () => {
      const citation: ParsedCitation = {
        raw: '1998:204 5 §', type: 'statute', document_id: '1998:204',
        section: '5', valid: true,
      };
      expect(formatCitation(citation, 'full')).toBe('SFS 1998:204 5 §');
    });
  });

  describe('statute - short format', () => {
    it('should format as short with chapter:section', () => {
      const citation: ParsedCitation = {
        raw: '', type: 'statute', document_id: '2018:218',
        chapter: '3', section: '5', valid: true,
      };
      expect(formatCitation(citation, 'short')).toBe('2018:218 3:5');
    });

    it('should format flat statute short', () => {
      const citation: ParsedCitation = {
        raw: '', type: 'statute', document_id: '1998:204',
        section: '5 a', valid: true,
      };
      expect(formatCitation(citation, 'short')).toBe('1998:204 5 a §');
    });
  });

  describe('statute - pinpoint format', () => {
    it('should format pinpoint with chapter and section', () => {
      const citation: ParsedCitation = {
        raw: '', type: 'statute', document_id: '2018:218',
        chapter: '3', section: '5', valid: true,
      };
      expect(formatCitation(citation, 'pinpoint')).toBe('3 kap. 5 §');
    });

    it('should format pinpoint with section only', () => {
      const citation: ParsedCitation = {
        raw: '', type: 'statute', document_id: '1998:204',
        section: '5', valid: true,
      };
      expect(formatCitation(citation, 'pinpoint')).toBe('5 §');
    });
  });

  describe('non-statute types', () => {
    it('should format bill', () => {
      const citation: ParsedCitation = {
        raw: 'Prop. 2017/18:105', type: 'bill', document_id: '2017/18:105', valid: true,
      };
      expect(formatCitation(citation)).toBe('Prop. 2017/18:105');
    });

    it('should format SOU', () => {
      const citation: ParsedCitation = {
        raw: 'SOU 2017:39', type: 'sou', document_id: '2017:39', valid: true,
      };
      expect(formatCitation(citation)).toBe('SOU 2017:39');
    });

    it('should format Ds', () => {
      const citation: ParsedCitation = {
        raw: 'Ds 2022:10', type: 'ds', document_id: '2022:10', valid: true,
      };
      expect(formatCitation(citation)).toBe('Ds 2022:10');
    });

    it('should format NJA case law', () => {
      const citation: ParsedCitation = {
        raw: 'NJA 2020 s. 45', type: 'case_law', document_id: 'NJA 2020',
        page: '45', valid: true,
      };
      expect(formatCitation(citation)).toBe('NJA 2020 s. 45');
    });

    it('should format HFD case law', () => {
      const citation: ParsedCitation = {
        raw: 'HFD 2019 ref. 12', type: 'case_law', document_id: 'HFD 2019',
        page: '12', valid: true,
      };
      expect(formatCitation(citation)).toBe('HFD 2019 ref. 12');
    });
  });

  describe('invalid citation', () => {
    it('should return raw text for invalid citation', () => {
      const citation: ParsedCitation = {
        raw: 'bad input', type: 'statute', document_id: '', valid: false,
      };
      expect(formatCitation(citation)).toBe('bad input');
    });
  });
});

describe('formatProvisionRef', () => {
  it('should format chaptered provision', () => {
    expect(formatProvisionRef('3', '5')).toBe('3:5');
  });

  it('should format flat provision', () => {
    expect(formatProvisionRef(undefined, '5')).toBe('5');
  });

  it('should handle special numbering', () => {
    expect(formatProvisionRef(undefined, '5 a')).toBe('5 a');
  });
});
