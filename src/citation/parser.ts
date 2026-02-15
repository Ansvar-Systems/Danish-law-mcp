/**
 * Parse Swedish legal citation strings into structured objects.
 *
 * Supported formats:
 *   - SFS 2018:218
 *   - SFS 2018:218 3 kap. 5 §
 *   - 2018:218 3 kap. 5 §
 *   - Prop. 2017/18:105
 *   - SOU 2023:45
 *   - Ds 2022:10
 *   - NJA 2020 s. 45
 *   - HFD 2019 ref. 12
 */

import type { ParsedCitation, DocumentType } from '../types/index.js';

/** SFS statute pattern: SFS 2018:218 [3 kap.] [5 [a] §] or short form [3:5] */
const SFS_PATTERN = /^(?:SFS\s+)?(\d{4}:\d+)\s*(?:(\d+)\s*kap\.\s*)?(?:(\d+\s*[a-z]?)\s*§)?/i;
/** Short form statute pattern: 2018:218 3:5 */
const SFS_SHORT_PATTERN = /^(?:SFS\s+)?(\d{4}:\d+)\s+(\d+):(\d+\s*[a-z]?)\s*$/i;

/** Proposition pattern: Prop. 2017/18:105 */
const PROP_PATTERN = /^Prop\.\s*(\d{4}\/\d{2}:\d+)/i;

/** SOU pattern: SOU 2023:45 */
const SOU_PATTERN = /^SOU\s+(\d{4}:\d+)/i;

/** Ds pattern: Ds 2022:10 */
const DS_PATTERN = /^Ds\s+(\d{4}:\d+)/i;

/** Case law patterns: NJA 2020 s. 45, HFD 2019 ref. 12 */
const CASE_NJA_PATTERN = /^(NJA)\s+(\d{4})\s+s\.\s*(\d+)/i;
const CASE_HFD_PATTERN = /^(HFD)\s+(\d{4})\s+ref\.\s*(\d+)/i;
const CASE_GENERIC_PATTERN = /^(AD|MD|MIG)\s+(\d{4})\s+(?:nr|ref\.?)\s*(\d+)/i;

/**
 * Parse a Swedish legal citation string.
 *
 * @param citation - Raw citation string
 * @returns Parsed citation with type, document ID, and optional provision reference
 */
export function parseCitation(citation: string): ParsedCitation {
  const trimmed = citation.trim();

  if (!trimmed) {
    return { raw: citation, type: 'statute', document_id: '', valid: false, error: 'Empty citation' };
  }

  // Try proposition first (starts with "Prop.")
  const propMatch = trimmed.match(PROP_PATTERN);
  if (propMatch) {
    return {
      raw: citation,
      type: 'bill',
      document_id: propMatch[1],
      valid: true,
    };
  }

  // Try SOU
  const souMatch = trimmed.match(SOU_PATTERN);
  if (souMatch) {
    return {
      raw: citation,
      type: 'sou',
      document_id: souMatch[1],
      valid: true,
    };
  }

  // Try Ds
  const dsMatch = trimmed.match(DS_PATTERN);
  if (dsMatch) {
    return {
      raw: citation,
      type: 'ds',
      document_id: dsMatch[1],
      valid: true,
    };
  }

  // Try case law patterns
  for (const pattern of [CASE_NJA_PATTERN, CASE_HFD_PATTERN, CASE_GENERIC_PATTERN]) {
    const caseMatch = trimmed.match(pattern);
    if (caseMatch) {
      return {
        raw: citation,
        type: 'case_law',
        document_id: `${caseMatch[1].toUpperCase()} ${caseMatch[2]}`,
        page: caseMatch[3],
        valid: true,
      };
    }
  }

  // Try SFS statute short form first (2018:218 3:5)
  const sfsShortMatch = trimmed.match(SFS_SHORT_PATTERN);
  if (sfsShortMatch && sfsShortMatch[1]) {
    return {
      raw: citation,
      type: 'statute',
      document_id: sfsShortMatch[1],
      chapter: sfsShortMatch[2],
      section: sfsShortMatch[3].replace(/\s+/g, ' ').trim(),
      valid: true,
    };
  }

  // Try SFS statute long form (with or without "SFS" prefix)
  const sfsMatch = trimmed.match(SFS_PATTERN);
  if (sfsMatch && sfsMatch[1]) {
    const result: ParsedCitation = {
      raw: citation,
      type: 'statute',
      document_id: sfsMatch[1],
      valid: true,
    };

    if (sfsMatch[2]) {
      result.chapter = sfsMatch[2];
    }
    if (sfsMatch[3]) {
      result.section = sfsMatch[3].replace(/\s+/g, ' ').trim();
    }

    return result;
  }

  return {
    raw: citation,
    type: 'statute',
    document_id: '',
    valid: false,
    error: `Unrecognized citation format: "${trimmed}"`,
  };
}

/**
 * Detect the document type from a citation string without full parsing.
 */
export function detectDocumentType(citation: string): DocumentType | null {
  const trimmed = citation.trim().toLowerCase();
  if (trimmed.startsWith('prop.')) return 'bill';
  if (trimmed.startsWith('sou ')) return 'sou';
  if (trimmed.startsWith('ds ')) return 'ds';
  if (/^(nja|hfd|ad|md|mig)\s/i.test(trimmed)) return 'case_law';
  if (/^(?:sfs\s+)?\d{4}:\d+/.test(trimmed)) return 'statute';
  return null;
}
