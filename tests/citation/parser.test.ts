import { describe, it, expect } from 'vitest';
import { parseCitation, detectDocumentType } from '../../src/citation/parser.js';

describe('parseCitation', () => {
  describe('SFS statutes', () => {
    it('should parse SFS number with prefix', () => {
      const result = parseCitation('SFS 2018:218');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('statute');
      expect(result.document_id).toBe('2018:218');
      expect(result.chapter).toBeUndefined();
      expect(result.section).toBeUndefined();
    });

    it('should parse SFS number without prefix', () => {
      const result = parseCitation('2018:218');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('statute');
      expect(result.document_id).toBe('2018:218');
    });

    it('should parse SFS with chapter and section', () => {
      const result = parseCitation('SFS 2018:218 3 kap. 5 §');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('2018:218');
      expect(result.chapter).toBe('3');
      expect(result.section).toBe('5');
    });

    it('should parse SFS with section only (flat statute)', () => {
      const result = parseCitation('1998:204 5 §');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('1998:204');
      expect(result.chapter).toBeUndefined();
      expect(result.section).toBe('5');
    });

    it('should parse special section numbering like 5 a §', () => {
      const result = parseCitation('1998:204 5 a §');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('1998:204');
      expect(result.section).toBe('5 a');
    });

    it('should parse SFS with chapter only', () => {
      const result = parseCitation('SFS 2018:218 1 kap.');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('2018:218');
      expect(result.chapter).toBe('1');
      expect(result.section).toBeUndefined();
    });

    it('should parse SFS in short form with chapter:section', () => {
      const result = parseCitation('2018:218 3:2');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('statute');
      expect(result.document_id).toBe('2018:218');
      expect(result.chapter).toBe('3');
      expect(result.section).toBe('2');
    });

    it('should parse SFS in short form with SFS prefix', () => {
      const result = parseCitation('SFS 2018:218 3:5');
      expect(result.valid).toBe(true);
      expect(result.document_id).toBe('2018:218');
      expect(result.chapter).toBe('3');
      expect(result.section).toBe('5');
    });
  });

  describe('propositions', () => {
    it('should parse Prop. citation', () => {
      const result = parseCitation('Prop. 2017/18:105');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('bill');
      expect(result.document_id).toBe('2017/18:105');
    });
  });

  describe('SOU', () => {
    it('should parse SOU citation', () => {
      const result = parseCitation('SOU 2017:39');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('sou');
      expect(result.document_id).toBe('2017:39');
    });
  });

  describe('Ds', () => {
    it('should parse Ds citation', () => {
      const result = parseCitation('Ds 2022:10');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('ds');
      expect(result.document_id).toBe('2022:10');
    });
  });

  describe('case law', () => {
    it('should parse NJA citation', () => {
      const result = parseCitation('NJA 2020 s. 45');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('case_law');
      expect(result.document_id).toBe('NJA 2020');
      expect(result.page).toBe('45');
    });

    it('should parse HFD citation', () => {
      const result = parseCitation('HFD 2019 ref. 12');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('case_law');
      expect(result.document_id).toBe('HFD 2019');
      expect(result.page).toBe('12');
    });

    it('should parse AD citation', () => {
      const result = parseCitation('AD 2021 nr 5');
      expect(result.valid).toBe(true);
      expect(result.type).toBe('case_law');
      expect(result.document_id).toBe('AD 2021');
      expect(result.page).toBe('5');
    });
  });

  describe('error cases', () => {
    it('should return invalid for empty string', () => {
      const result = parseCitation('');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return invalid for unrecognized format', () => {
      const result = parseCitation('some random text');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unrecognized');
    });
  });
});

describe('detectDocumentType', () => {
  it('should detect statute', () => {
    expect(detectDocumentType('SFS 2018:218')).toBe('statute');
    expect(detectDocumentType('2018:218')).toBe('statute');
  });

  it('should detect bill', () => {
    expect(detectDocumentType('Prop. 2017/18:105')).toBe('bill');
  });

  it('should detect SOU', () => {
    expect(detectDocumentType('SOU 2017:39')).toBe('sou');
  });

  it('should detect Ds', () => {
    expect(detectDocumentType('Ds 2022:10')).toBe('ds');
  });

  it('should detect case law', () => {
    expect(detectDocumentType('NJA 2020 s. 45')).toBe('case_law');
    expect(detectDocumentType('HFD 2019 ref. 12')).toBe('case_law');
  });

  it('should return null for unknown', () => {
    expect(detectDocumentType('random text')).toBeNull();
  });
});
