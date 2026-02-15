/**
 * Extract cross-references from Swedish legal provision text.
 *
 * Detects patterns like:
 *   - "3 kap. 5 para" (same statute, different provision)
 *   - "lagen (2018:218)" (reference to another statute)
 */

/** An extracted cross-reference */
export interface ExtractedRef {
  /** SFS number if detected */
  target_sfs?: string;
  /** Target provision reference (e.g., "3:5") */
  target_provision_ref?: string;
  /** Raw text of the reference */
  raw_text: string;
}

/** Pattern for "(yyyy:nnn)" SFS references within text */
const SFS_REF_PATTERN = /\((\d{4}:\d+)\)/g;

/** Pattern for "X kap. Y para-sign" provision references */
const PROVISION_REF_PATTERN = /(\d+)\s*kap\.\s*(\d+\s*[a-z]?)\s*\u00a7/g;

/**
 * Extract cross-references from provision text.
 *
 * @param text - Provision content text
 * @returns Array of extracted references
 */
export function extractCrossReferences(text: string): ExtractedRef[] {
  const refs: ExtractedRef[] = [];
  const seen = new Set<string>();

  // Extract SFS number references: "(2018:218)"
  let match;
  while ((match = SFS_REF_PATTERN.exec(text)) !== null) {
    const key = `sfs:${match[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({
        target_sfs: match[1],
        raw_text: match[0],
      });
    }
  }

  // Extract "X kap. Y section-symbol" references
  while ((match = PROVISION_REF_PATTERN.exec(text)) !== null) {
    const chapter = match[1];
    const section = match[2].replace(/\s+/g, ' ').trim();
    const ref = `${chapter}:${section}`;
    const key = `prov:${ref}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({
        target_provision_ref: ref,
        raw_text: match[0],
      });
    }
  }

  return refs;
}
