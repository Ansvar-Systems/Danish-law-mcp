/**
 * EU Reference Parser
 *
 * Extracts and structures EU law references (directives and regulations)
 * from Swedish legal text.
 *
 * Based on analysis of 83 Swedish statutes showing 406 EU references:
 * - 164 directives (40%)
 * - 242 regulations (60%)
 */

export interface EUReference {
  type: 'directive' | 'regulation';
  id: string;                    // Format: "2016/679"
  year: number;
  number: number;
  community?: 'EU' | 'EG' | 'EEG' | 'Euratom';
  issuingBody?: string;          // "Europaparlamentet och rådet", "Kommissionen", etc.
  article?: string;              // Specific article reference (e.g., "6.1.c", "13-15")
  fullText: string;              // Full citation as found in text
  context: string;               // Surrounding text (100 chars before/after)
  referenceType?: ReferenceType; // How the EU act is referenced
  implementationKeyword?: string; // "genomförande", "komplettering", etc.
}

export type ReferenceType =
  | 'implements'        // Swedish law implements this EU directive
  | 'supplements'       // Swedish law supplements this EU regulation
  | 'applies'           // This EU regulation applies directly
  | 'references'        // General reference to EU law
  | 'complies_with'     // Swedish law must comply with this
  | 'derogates_from'    // Swedish law derogates from this
  | 'cites_article';    // Cites specific article(s)

/**
 * Regex patterns for matching EU references
 */
const PATTERNS = {
  // Directives: direktiv 2016/680, direktiv 95/46/EG, direktiv (EU) 2019/1152
  directive: [
    // With community designation in parentheses: direktiv (EU) 2016/680
    /direktiv\s+\(([^)]+)\)\s+(\d{2,4})\/(\d+)/gi,
    // With community at end: direktiv 95/46/EG
    /direktiv\s+(\d{2,4})\/(\d+)(?:\/([A-Z]+))?/gi,
    // With issuing body
    /(rådets|kommissionens|Europaparlamentets och rådets)\s+direktiv\s+(?:\(([^)]+)\)\s+)?(\d{2,4})\/(\d+)(?:\/([A-Z]+))?/gi,
  ],

  // Regulations: förordning (EU) 2016/679, förordning (EG) nr 765/2008
  regulation: [
    // With community and optional "nr": förordning (EU) nr 2016/679
    /förordning\s+\(([^)]+)\)\s+(?:nr\s+)?(\d{2,4})\/(\d+)/gi,
    // With issuing body
    /(rådets|kommissionens|Europaparlamentets och rådets|kommissionens genomförandeförordning|kommissionens delegerade förordning)\s+\(([^)]+)\)\s+(?:nr\s+)?(\d{2,4})\/(\d+)/gi,
  ],

  // Article references: artikel 6.1.c, artiklarna 13-15, artikel 83.4, 83.5 och 83.6
  article: [
    /artikel\s+([\d.]+(?:\s*,\s*[\d.]+)*(?:\s+och\s+[\d.]+)?)/gi,
    /artiklarna\s+([\d\s-]+(?:,\s*[\d\s-]+)*(?:\s+och\s+[\d\s-]+)?)/gi,
  ],
};

/**
 * Implementation keywords that indicate reference type
 */
const IMPLEMENTATION_KEYWORDS: Record<string, ReferenceType> = {
  'genomförande': 'implements',
  'genomför': 'implements',
  'kompletterar': 'supplements',
  'komplettering': 'supplements',
  'tillämpning': 'applies',
  'tillämpas': 'applies',
  'i enlighet med': 'complies_with',
  'överensstämmelse med': 'complies_with',
  'med stöd av': 'cites_article',
  'enligt': 'cites_article',
};

/**
 * Extract all EU references from Swedish legal text
 */
export function extractEUReferences(text: string): EUReference[] {
  const references: EUReference[] = [];
  const seen = new Set<string>();

  // Extract directives
  for (const pattern of PATTERNS.directive) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const ref = parseDirectiveMatch(match, text);
      if (ref && !seen.has(ref.id + ':' + ref.community)) {
        seen.add(ref.id + ':' + ref.community);
        references.push(ref);
      }
    }
  }

  // Extract regulations
  for (const pattern of PATTERNS.regulation) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const ref = parseRegulationMatch(match, text);
      if (ref && !seen.has(ref.id + ':' + ref.community)) {
        seen.add(ref.id + ':' + ref.community);
        references.push(ref);
      }
    }
  }

  // Enhance references with article citations and context
  return references.map(ref => enhanceReference(ref, text));
}

/**
 * Parse a directive regex match
 */
function parseDirectiveMatch(match: RegExpMatchArray, text: string): EUReference | null {
  const fullText = match[0];
  const index = match.index || 0;

  let year: number;
  let number: number;
  let community: 'EU' | 'EG' | 'EEG' | 'Euratom' | undefined;
  let issuingBody: string | undefined;

  // Determine which pattern matched
  // Pattern 1: direktiv (EU) 2016/680 -> match[1]=EU, match[2]=2016, match[3]=680
  // Pattern 2: direktiv 2016/680/EG -> match[1]=2016, match[2]=680, match[3]=EG
  // Pattern 3: rådets direktiv (EU) 2016/680 -> match[1]=rådets, match[2]=EU, match[3]=2016, match[4]=680

  // Check if first capture group looks like issuing body
  if (match[1] && match[1].match(/rådet|kommission|Europa/i)) {
    // Pattern 3: issuing body present
    issuingBody = match[1];
    community = parseCommunity(match[2] || 'EU');
    year = parseInt(match[3]);
    number = parseInt(match[4]);
  } else if (match[1] && !match[1].match(/^\d/) && match[2] && match[3]) {
    // Pattern 1: community in parentheses (first group is not a digit)
    community = parseCommunity(match[1]);
    year = parseInt(match[2]);
    number = parseInt(match[3]);
  } else if (match[1] && match[1].match(/^\d/) && match[2]) {
    // Pattern 2: year/number format, optional community at end
    year = parseInt(match[1]);
    number = parseInt(match[2]);
    community = match[3] ? parseCommunity(match[3]) : 'EU';
  } else {
    return null;
  }

  // Validate we got valid numbers
  if (isNaN(year) || isNaN(number)) {
    return null;
  }

  // Normalize 2-digit years to 4-digit
  if (year < 100) {
    year = year < 50 ? 2000 + year : 1900 + year;
  }

  const id = `${year}/${number}`;
  const context = extractContext(text, index, fullText.length);

  return {
    type: 'directive',
    id,
    year,
    number,
    community,
    issuingBody,
    fullText,
    context,
  };
}

/**
 * Parse a regulation regex match
 */
function parseRegulationMatch(match: RegExpMatchArray, text: string): EUReference | null {
  const fullText = match[0];
  const index = match.index || 0;

  let year: number;
  let number: number;
  let community: 'EU' | 'EG' | 'EEG' | 'Euratom' | undefined;
  let issuingBody: string | undefined;

  // Check if we have an issuing body
  if (match[1] && match[1].match(/rådet|kommission|Europa/i)) {
    // Has issuing body
    issuingBody = match[1];
    community = parseCommunity(match[2] || 'EU');
    year = parseInt(match[3]);
    number = parseInt(match[4]);
  } else if (match[1] && match[2] && match[3]) {
    // Simple pattern: förordning (EU) 2016/679
    community = parseCommunity(match[1]);
    year = parseInt(match[2]);
    number = parseInt(match[3]);
  } else {
    return null;
  }

  // Validate we got valid numbers
  if (isNaN(year) || isNaN(number)) {
    return null;
  }

  // Normalize 2-digit years
  if (year < 100) {
    year = year < 50 ? 2000 + year : 1900 + year;
  }

  const id = `${year}/${number}`;
  const context = extractContext(text, index, fullText.length);

  return {
    type: 'regulation',
    id,
    year,
    number,
    community,
    issuingBody,
    fullText,
    context,
  };
}

/**
 * Parse community designation (EU, EG, EEG, Euratom)
 */
function parseCommunity(text: string): 'EU' | 'EG' | 'EEG' | 'Euratom' {
  const normalized = text.toUpperCase().trim();
  if (normalized.includes('EURATOM')) return 'Euratom';
  if (normalized.includes('EEG')) return 'EEG';
  if (normalized.includes('EG')) return 'EG';
  return 'EU';
}

/**
 * Extract context around a match (100 chars before/after)
 */
function extractContext(text: string, index: number, matchLength: number): string {
  const start = Math.max(0, index - 100);
  const end = Math.min(text.length, index + matchLength + 100);
  return text.substring(start, end).replace(/\s+/g, ' ').trim();
}

/**
 * Enhance reference with article citations and implementation keywords
 */
function enhanceReference(ref: EUReference, _text: string): EUReference {
  // Look for article references near this EU reference
  const contextWindow = ref.context;
  const articleMatches = contextWindow.match(/artikel\s+([\d.]+(?:\s*,\s*[\d.]+)*(?:\s+och\s+[\d.]+)?)/i);
  if (articleMatches) {
    ref.article = articleMatches[1].trim();
    ref.referenceType = 'cites_article';
  }

  // Check for implementation keywords
  const lowerContext = contextWindow.toLowerCase();
  for (const [keyword, refType] of Object.entries(IMPLEMENTATION_KEYWORDS)) {
    if (lowerContext.includes(keyword)) {
      ref.implementationKeyword = keyword;
      if (!ref.referenceType) {
        ref.referenceType = refType;
      }
      break;
    }
  }

  // Default reference type if not determined
  if (!ref.referenceType) {
    ref.referenceType = ref.type === 'directive' ? 'implements' : 'applies';
  }

  return ref;
}

/**
 * Generate database-compatible ID for EU document
 * Format: "directive:2016/679" or "regulation:2016/679"
 */
export function generateEUDocumentId(ref: EUReference): string {
  return `${ref.type}:${ref.id}`;
}

/**
 * Parse EU document ID back to components
 */
export function parseEUDocumentId(id: string): { type: 'directive' | 'regulation'; year: number; number: number } | null {
  const match = id.match(/^(directive|regulation):(\d{4})\/(\d+)$/);
  if (!match) return null;

  return {
    type: match[1] as 'directive' | 'regulation',
    year: parseInt(match[2]),
    number: parseInt(match[3]),
  };
}

/**
 * Format EU reference for display
 */
export function formatEUReference(ref: EUReference, format: 'short' | 'full' = 'short'): string {
  if (format === 'short') {
    const community = ref.community || 'EU';
    const typeLabel = ref.type === 'directive' ? 'direktiv' : 'förordning';
    return `${typeLabel} (${community}) ${ref.id}`;
  }

  // Full format with issuing body
  let result = '';
  if (ref.issuingBody) {
    result += ref.issuingBody + ' ';
  }
  result += ref.type === 'directive' ? 'direktiv ' : 'förordning ';
  result += `(${ref.community || 'EU'}) ${ref.id}`;

  if (ref.article) {
    result += `, artikel ${ref.article}`;
  }

  return result;
}

/**
 * Get CELEX number for EU document (standard EU document identifier)
 * Format: 3YYYYXNNNNN where:
 * - 3 = third sector (EU legislation)
 * - YYYY = year
 * - X = type (L=directive, R=regulation)
 * - NNNNN = sequential number (zero-padded)
 */
export function generateCELEXNumber(ref: EUReference): string {
  const year = ref.year;
  const typeCode = ref.type === 'directive' ? 'L' : 'R';
  const number = ref.number.toString().padStart(4, '0');
  return `3${year}${typeCode}${number}`;
}
