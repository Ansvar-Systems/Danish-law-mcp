/**
 * Domain types for Danish legal documents.
 */

/** Types of legal documents in the Danish system */
export type DocumentType = 'statute' | 'bill' | 'sou' | 'ds' | 'case_law';

/** Status of a legal document */
export type DocumentStatus = 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';

/** Danish court types */
export type CourtType = 'HD' | 'HFD' | 'AD' | 'MD' | 'MIG' | 'hovrätt' | 'kammarrätt' | 'tingsrätt' | 'förvaltningsrätt';

/** A legal document in the Danish system */
export interface LegalDocument {
  /** SFS number (e.g., "2018:218"), case reference, or prop number */
  id: string;

  /** Document type */
  type: DocumentType;

  /** Danish title */
  title: string;

  /** English title if available */
  title_en?: string;

  /** Short name / abbreviation (e.g., "DSL", "BrB") */
  short_name?: string;

  /** Current status */
  status: DocumentStatus;

  /** Issuing date (ISO 8601) */
  issued_date?: string;

  /** Date entering into force */
  in_force_date?: string;

  /** URL to official source */
  url?: string;

  /** Summary / description */
  description?: string;
}
