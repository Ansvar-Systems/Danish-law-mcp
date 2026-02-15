/**
 * Format Swedish legal citations per standard conventions.
 */

import type { ParsedCitation, CitationFormat } from '../types/index.js';

/**
 * Format a parsed citation into a standard Swedish citation string.
 *
 * Formats:
 *   - full:     "SFS 2018:218 3 kap. 5 §" or "Prop. 2017/18:105"
 *   - short:    "2018:218 3:5" or "Prop. 2017/18:105"
 *   - pinpoint: "3 kap. 5 §" (provision only, requires chapter/section)
 */
export function formatCitation(citation: ParsedCitation, format: CitationFormat = 'full'): string {
  if (!citation.valid) {
    return citation.raw;
  }

  switch (citation.type) {
    case 'statute':
      return formatStatute(citation, format);
    case 'bill':
      return `Prop. ${citation.document_id}`;
    case 'sou':
      return `SOU ${citation.document_id}`;
    case 'ds':
      return `Ds ${citation.document_id}`;
    case 'case_law':
      return formatCaseLaw(citation);
    default:
      return citation.raw;
  }
}

function formatStatute(citation: ParsedCitation, format: CitationFormat): string {
  const { document_id, chapter, section } = citation;

  if (format === 'pinpoint') {
    if (chapter && section) return `${chapter} kap. ${section} §`;
    if (section) return `${section} §`;
    return document_id;
  }

  if (format === 'short') {
    if (chapter && section) return `${document_id} ${chapter}:${section}`;
    if (section) return `${document_id} ${section} §`;
    return document_id;
  }

  // full format
  let result = `SFS ${document_id}`;
  if (chapter) result += ` ${chapter} kap.`;
  if (section) result += ` ${section} §`;
  return result;
}

function formatCaseLaw(citation: ParsedCitation): string {
  const parts = [citation.document_id];

  // Determine the correct connector based on court
  if (citation.document_id.startsWith('NJA')) {
    if (citation.page) parts.push(`s. ${citation.page}`);
  } else {
    if (citation.page) parts.push(`ref. ${citation.page}`);
  }

  return parts.join(' ');
}

/**
 * Format a provision reference string from chapter and section.
 * Returns e.g. "3:5" for chapter 3 section 5, or just "5" for flat statutes.
 */
export function formatProvisionRef(chapter: string | undefined, section: string): string {
  if (chapter) {
    return `${chapter}:${section}`;
  }
  return section;
}
