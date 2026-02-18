/**
 * EU References Types
 *
 * Types for EU law cross-references in Danish legislation.
 */

export type EUDocumentType = 'directive' | 'regulation';

export type EUCommunity = 'EU' | 'EG' | 'EEG' | 'Euratom';

export type ReferenceType =
  | 'implements'          // Danish law implements this EU directive
  | 'supplements'         // Danish law supplements this EU regulation
  | 'applies'             // This EU regulation applies directly
  | 'references'          // General reference to EU law
  | 'complies_with'       // Danish law must comply with this
  | 'derogates_from'      // Danish law derogates from this (allowed by EU law)
  | 'amended_by'          // Danish law was amended to implement this
  | 'repealed_by'         // Danish law was repealed by this EU act
  | 'cites_article';      // Cites specific article(s) of EU act

export type ImplementationStatus = 'complete' | 'partial' | 'pending' | 'unknown';

export interface EUDocument {
  id: string;                    // "directive:2016/679" or "regulation:2016/679"
  type: EUDocumentType;
  year: number;
  number: number;
  community: EUCommunity;
  celex_number?: string;         // "32016R0679"
  title?: string;
  /** @deprecated Legacy DB column name — retained for schema compatibility */
  title_sv?: string;
  short_name?: string;           // "GDPR"
  adoption_date?: string;
  entry_into_force_date?: string;
  in_force: boolean;
  amended_by?: string;           // JSON array
  repeals?: string;              // JSON array
  url_eur_lex?: string;
  description?: string;
  last_updated?: string;
}

export interface EUReference {
  id: number;
  source_type: 'provision' | 'document' | 'case_law';
  source_id: string;
  document_id: string;           // National document identifier (e.g., "2018:502")
  provision_id?: number;
  eu_document_id: string;
  eu_article?: string;           // "6.1.c", "13-15", etc.
  reference_type: ReferenceType;
  reference_context?: string;
  full_citation?: string;
  is_primary_implementation: boolean;
  implementation_status?: ImplementationStatus;
  created_at?: string;
  last_verified?: string;
}

export interface EUBasisDocument {
  id: string;
  type: EUDocumentType;
  year: number;
  number: number;
  community: EUCommunity;
  celex_number?: string;
  title?: string;
  short_name?: string;
  reference_type: ReferenceType;
  is_primary_implementation: boolean;
  articles?: string[];
  url_eur_lex?: string;
}

export interface DanishImplementation {
  document_id: string;
  document_title: string;
  short_name?: string;
  status: string;
  reference_type: ReferenceType;
  is_primary_implementation: boolean;
  implementation_status?: ImplementationStatus;
  articles_referenced?: string[];
  /** @deprecated Legacy alias for document_id — retained for backward compatibility */
  sfs_number?: string;
  /** @deprecated Legacy alias for document_title — retained for backward compatibility */
  sfs_title?: string;
}

export interface ProvisionEUReference {
  id: string;
  type: EUDocumentType;
  title?: string;
  short_name?: string;
  article?: string;
  reference_type: ReferenceType;
  full_citation: string;
  context?: string;
}

/** @deprecated Use DanishImplementation instead */
export type SwedishImplementation = DanishImplementation;
