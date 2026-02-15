/**
 * Types for Danish legal citation parsing, formatting, and validation.
 */

import type { DocumentType, DocumentStatus } from './documents.js';

/** Supported citation formats */
export type CitationFormat = 'full' | 'short' | 'pinpoint';

/** Result of parsing a citation string */
export interface ParsedCitation {
  /** Original citation string */
  raw: string;

  /** Detected document type */
  type: DocumentType;

  /** Document identifier (SFS number, case ref, prop number) */
  document_id: string;

  /** Chapter reference (if any) */
  chapter?: string;

  /** Section/paragraph reference (if any) */
  section?: string;

  /** Page reference for case law (e.g., "s. 45") */
  page?: string;

  /** Whether parsing succeeded */
  valid: boolean;

  /** Parse error message if invalid */
  error?: string;
}

/** Result of validating a citation against the database */
export interface ValidationResult {
  /** The parsed citation */
  citation: ParsedCitation;

  /** Whether the cited document exists in the database */
  document_exists: boolean;

  /** Whether the specific provision exists (if cited) */
  provision_exists: boolean;

  /** Current document status */
  status?: DocumentStatus;

  /** Title of the document (if found) */
  document_title?: string;

  /** Warning messages (e.g., "statute has been amended") */
  warnings: string[];
}
