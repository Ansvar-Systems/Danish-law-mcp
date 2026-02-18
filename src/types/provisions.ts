/**
 * Types for legal provisions (paragrafer) within Danish statutes.
 */

/** A specific provision within a statute */
export interface LegalProvision {
  /** Auto-increment ID */
  id: number;

  /** SFS number of the parent statute */
  document_id: string;

  /** Provision reference, e.g., "3:5" for Kap 3 Para 5, or "5" for flat statutes */
  provision_ref: string;

  /** Chapter number (null for flat statutes) */
  chapter?: string;

  /** Section/paragraph number */
  section: string;

  /** Rubrik (heading) for the provision */
  title?: string;

  /** Full text content in Danish */
  content: string;

  /** JSON metadata: stycken, punkter, etc. */
  metadata?: Record<string, unknown>;
}

/** A reference to a specific provision */
export interface ProvisionRef {
  /** SFS number */
  document_id: string;

  /** Chapter (may be undefined for flat statutes) */
  chapter?: string;

  /** Section number */
  section: string;
}

/** A cross-reference between provisions or documents */
export interface CrossReference {
  /** Source provision or document */
  source_document_id: string;
  source_provision_ref?: string;

  /** Target provision or document */
  target_document_id: string;
  target_provision_ref?: string;

  /** Type of reference */
  ref_type: 'references' | 'amended_by' | 'implements' | 'see_also';
}
