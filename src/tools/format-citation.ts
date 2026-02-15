/**
 * format_citation — Format a Swedish legal citation per standard conventions.
 */

import { parseCitation } from '../citation/parser.js';
import { formatCitation } from '../citation/formatter.js';
import type { CitationFormat } from '../types/index.js';
import { generateResponseMetadata, type ToolResponse } from '../utils/metadata.js';

export interface FormatCitationInput {
  citation: string;
  format?: CitationFormat;
}

export interface FormatCitationResult {
  input: string;
  formatted: string;
  type: string;
  valid: boolean;
  error?: string;
}

export async function formatCitationTool(
  input: FormatCitationInput
): Promise<ToolResponse<FormatCitationResult>> {
  if (!input.citation || input.citation.trim().length === 0) {
    return {
      results: { input: '', formatted: '', type: 'unknown', valid: false, error: 'Empty citation' },
      _metadata: generateResponseMetadata()
    };
  }

  const parsed = parseCitation(input.citation);

  if (!parsed.valid) {
    return {
      results: {
        input: input.citation,
        formatted: input.citation,
        type: 'unknown',
        valid: false,
        error: parsed.error,
      },
      _metadata: generateResponseMetadata()
    };
  }

  const formatted = formatCitation(parsed, input.format ?? 'full');

  return {
    results: {
      input: input.citation,
      formatted,
      type: parsed.type,
      valid: true,
    },
    _metadata: generateResponseMetadata()
  };
}
