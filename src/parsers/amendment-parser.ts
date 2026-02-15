/**
 * Parse amendment references from Swedish statute text.
 *
 * Swedish statutes indicate amendments using standard phrases:
 *   - "Lag (YYYY:NNN)." at end of provision
 *   - "Upphävd genom lag (YYYY:NNN)"
 *   - "Införd genom lag (YYYY:NNN)"
 *   - "Har upphävts genom lag (YYYY:NNN)"
 *
 * Example:
 *   "...personuppgifter. Lag (2021:1174)."
 *   → Amendment by SFS 2021:1174
 */

export interface AmendmentReference {
  /** SFS number of amending statute, e.g., "2021:1174" */
  amended_by_sfs: string;

  /** Type of amendment */
  amendment_type: 'ändrad' | 'ny_lydelse' | 'införd' | 'upphävd' | 'ikraftträdande';

  /** Position in text where reference was found */
  position: 'suffix' | 'inline' | 'transition';

  /** Raw text fragment containing the reference */
  raw_text: string;
}

export interface ProvisionAmendment {
  /** Target provision reference, e.g., "1:3" */
  provision_ref: string;

  /** Amendment references found in this provision */
  amendments: AmendmentReference[];
}

/** Standard amendment suffix: "Lag (YYYY:NNN)." at end of provision */
const SUFFIX_PATTERN = /Lag\s*\((\d{4}:\d+)\)\.\s*$/u;

/** Repealed: "Upphävd genom lag (YYYY:NNN)" */
const REPEALED_PATTERN = /[Uu]pphävd\s+genom\s+lag\s*\((\d{4}:\d+)\)/gu;

/** Introduced: "Införd genom lag (YYYY:NNN)" */
const INTRODUCED_PATTERN = /[Ii]nförd\s+genom\s+lag\s*\((\d{4}:\d+)\)/gu;

/** Has been repealed: "Har upphävts genom lag (YYYY:NNN)" */
const HAS_REPEALED_PATTERN = /[Hh]ar\s+upphävts\s+genom\s+lag\s*\((\d{4}:\d+)\)/gu;

/** Force of law date: "Träder i kraft (date)" - for transitional provisions */
const FORCE_PATTERN = /[Tt]räder\s+i\s+kraft/u;

/** Generic SFS reference: fallback for any "YYYY:NNN" pattern */
const SFS_PATTERN = /(\d{4}:\d+)/gu;

/**
 * Extract amendment references from provision text.
 *
 * Priority order (stops at first match):
 * 1. Suffix pattern (most common)
 * 2. Repealed pattern
 * 3. Introduced pattern
 * 4. Has-repealed pattern
 * 5. Generic SFS references (low priority)
 */
export function extractAmendmentReferences(content: string): AmendmentReference[] {
  const amendments: AmendmentReference[] = [];

  // 1. Check for suffix pattern (highest priority)
  const suffixMatch = content.match(SUFFIX_PATTERN);
  if (suffixMatch) {
    amendments.push({
      amended_by_sfs: suffixMatch[1],
      amendment_type: 'ändrad',
      position: 'suffix',
      raw_text: suffixMatch[0],
    });
    return amendments; // Suffix is definitive - stop here
  }

  // 2. Check for "upphävd genom" (repealed)
  for (const match of content.matchAll(REPEALED_PATTERN)) {
    amendments.push({
      amended_by_sfs: match[1],
      amendment_type: 'upphävd',
      position: 'inline',
      raw_text: match[0],
    });
  }

  // 3. Check for "införd genom" (introduced)
  for (const match of content.matchAll(INTRODUCED_PATTERN)) {
    amendments.push({
      amended_by_sfs: match[1],
      amendment_type: 'införd',
      position: 'inline',
      raw_text: match[0],
    });
  }

  // 4. Check for "har upphävts genom" (has been repealed)
  for (const match of content.matchAll(HAS_REPEALED_PATTERN)) {
    amendments.push({
      amended_by_sfs: match[1],
      amendment_type: 'upphävd',
      position: 'inline',
      raw_text: match[0],
    });
  }

  // 5. If in transitional provision section, check for force-of-law dates
  if (FORCE_PATTERN.test(content)) {
    // Transitional provisions often reference multiple SFS numbers
    const sfsRefs = Array.from(content.matchAll(SFS_PATTERN));
    for (const match of sfsRefs) {
      // Avoid duplicates
      if (!amendments.some(a => a.amended_by_sfs === match[1])) {
        amendments.push({
          amended_by_sfs: match[1],
          amendment_type: 'ikraftträdande',
          position: 'transition',
          raw_text: match[0],
        });
      }
    }
  }

  return amendments;
}

/**
 * Parse amendment references from all provisions in a statute.
 */
export function parseStatuteAmendments(
  provisions: Array<{ provision_ref: string; content: string }>
): ProvisionAmendment[] {
  const results: ProvisionAmendment[] = [];

  for (const provision of provisions) {
    const amendments = extractAmendmentReferences(provision.content);

    if (amendments.length > 0) {
      results.push({
        provision_ref: provision.provision_ref,
        amendments,
      });
    }
  }

  return results;
}

export interface StatuteMetadataAmendments {
  /** SFS number of statute that repealed this one, if any */
  repealed_by_sfs?: string;

  /** Date this statute was repealed, ISO format */
  repealed_date?: string;

  /** Free-text description of repeal */
  repeal_description?: string;

  /** SFS numbers mentioned in Riksdagen HTML metadata */
  referenced_sfs: string[];
}

/**
 * Extract amendment metadata from Riksdagen HTML document metadata.
 *
 * Riksdagen documents have HTML headers like:
 *   <b>Upphävd</b>: 2018-05-25
 *   <b>Författningen har upphävts genom</b>: SFS 2018:218
 */
export function extractMetadataAmendments(
  metadata: Record<string, string>
): StatuteMetadataAmendments {
  const result: StatuteMetadataAmendments = {
    referenced_sfs: [],
  };

  // Repeal date
  const repealDate = metadata['Upphävd'];
  if (repealDate) {
    const dateMatch = repealDate.match(/\d{4}-\d{2}-\d{2}/);
    if (dateMatch) {
      result.repealed_date = dateMatch[0];
    }
  }

  // Repealing statute
  const repealedBy = metadata['Författningen har upphävts genom'];
  if (repealedBy) {
    const sfsMatch = repealedBy.match(/(\d{4}:\d+)/);
    if (sfsMatch) {
      result.repealed_by_sfs = sfsMatch[1];
      result.referenced_sfs.push(sfsMatch[1]);
    }
    result.repeal_description = repealedBy;
  }

  // Extract all SFS references from all metadata values
  for (const value of Object.values(metadata)) {
    for (const match of value.matchAll(SFS_PATTERN)) {
      if (!result.referenced_sfs.includes(match[1])) {
        result.referenced_sfs.push(match[1]);
      }
    }
  }

  return result;
}

export interface AmendmentSection {
  /** Section number in amending statute, e.g., "1 §", "2 §" */
  section_ref: string;

  /** Target statute being amended, e.g., "2018:218" */
  target_statute_id: string;

  /** Target statute name */
  target_statute_name?: string;

  /** Target provision being amended, e.g., "1:3" */
  target_provision_ref?: string;

  /** Type of change */
  change_type: 'ändrad' | 'ny_lydelse' | 'införd' | 'upphävd' | 'övergångsbestämmelser';

  /** New text (for ny_lydelse/införd) */
  new_text?: string;

  /** Description of change */
  description?: string;
}

/**
 * Parse an amending statute document to extract amendment sections.
 *
 * Amending statutes typically have structure:
 *   1 § Ändringar i dataskyddslagen (2018:218)
 *   1 kap. 3 § ska ha följande lydelse:
 *   [new text]
 *
 * Note: Full implementation requires advanced Swedish legal NLP and
 * understanding of "ska ha följande lydelse" constructions.
 */
export function parseAmendingStatute(text: string): AmendmentSection[] {
  const sections: AmendmentSection[] = [];

  // Pattern: "Ändringar i [statute name] (YYYY:NNN)"
  const amendmentHeaderPattern = /Ändringar\s+i\s+([^(]+)\s*\((\d{4}:\d+)\)/gu;

  const matches = Array.from(text.matchAll(amendmentHeaderPattern));

  for (const match of matches) {
    const targetStatuteName = match[1].trim();
    const targetStatuteId = match[2];

    // Find the section number that precedes this amendment header
    const headerPos = match.index!;
    const precedingText = text.slice(Math.max(0, headerPos - 100), headerPos);
    const sectionMatch = precedingText.match(/(\d+)\s*§/);

    sections.push({
      section_ref: sectionMatch ? `${sectionMatch[1]} §` : 'unknown',
      target_statute_id: targetStatuteId,
      target_statute_name: targetStatuteName,
      change_type: 'ändrad', // Default; would need deeper parsing to distinguish
      description: `Amendments to ${targetStatuteName} (${targetStatuteId})`,
    });
  }

  return sections;
}

/**
 * Validate that an SFS number has correct format.
 */
export function isValidSfsNumber(sfs: string): boolean {
  return /^\d{4}:\d+$/.test(sfs);
}

/**
 * Format SFS number consistently (strip whitespace, normalize).
 */
export function normalizeSfsNumber(sfs: string): string | null {
  const match = sfs.match(/(\d{4}:\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract effective date from amendment text, if present.
 *
 * Example: "Denna lag träder i kraft den 1 juli 2021"
 * Returns: "2021-07-01"
 */
export function extractEffectiveDate(text: string): string | null {
  // Pattern: "träder i kraft den [DD] [month] [YYYY]"
  const monthNames: Record<string, string> = {
    'januari': '01', 'februari': '02', 'mars': '03', 'april': '04',
    'maj': '05', 'juni': '06', 'juli': '07', 'augusti': '08',
    'september': '09', 'oktober': '10', 'november': '11', 'december': '12',
  };

  const pattern = /träder\s+i\s+kraft\s+den\s+(\d{1,2})\s+([a-zåäö]+)\s+(\d{4})/iu;
  const match = text.match(pattern);

  if (match) {
    const day = match[1].padStart(2, '0');
    const month = monthNames[match[2].toLowerCase()];
    const year = match[3];

    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // Fallback: ISO date pattern
  const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  return isoMatch ? isoMatch[1] : null;
}
