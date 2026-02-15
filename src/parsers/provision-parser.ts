/**
 * Parse Swedish statute text into structured provisions.
 *
 * Detects and handles:
 *   - Chaptered statutes: "3 kap. 5 §" → provision_ref "3:5"
 *   - Flat statutes: "5 §" → provision_ref "5"
 *   - Special numbering: "5 a §" → provision_ref "5 a"
 */

/** Parsed provision from raw statute text */
export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
}

/** Chapter heading pattern: "1 kap. Inledande bestämmelser" */
const CHAPTER_PATTERN = /^(\d+)\s*kap\.\s*(.*)/;

/** Section pattern: "5 §" or "5 a §" */
const SECTION_PATTERN = /^(\d+\s*[a-z]?)\s*§\s*(.*)/;

/** Rubrik (heading) pattern — line entirely in bold or ending with colon */
const RUBRIK_PATTERN = /^[A-ZÅÄÖ][a-zåäöé]+(?: [a-zåäöé]+)*$/;

/**
 * Parse raw statute text into structured provisions.
 *
 * @param text - Full statute text
 * @returns Array of parsed provisions
 */
export function parseStatuteText(text: string): ParsedProvision[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const provisions: ParsedProvision[] = [];

  let currentChapter: string | undefined;
  let currentSection: string | undefined;
  let currentTitle: string | undefined;
  let currentContent: string[] = [];

  function flush(): void {
    if (currentSection && currentContent.length > 0) {
      const provisionRef = currentChapter
        ? `${currentChapter}:${currentSection}`
        : currentSection;

      provisions.push({
        provision_ref: provisionRef,
        chapter: currentChapter,
        section: currentSection,
        title: currentTitle,
        content: currentContent.join(' '),
      });
    }
    currentSection = undefined;
    currentTitle = undefined;
    currentContent = [];
  }

  for (const line of lines) {
    // Check for chapter heading
    const chapterMatch = line.match(CHAPTER_PATTERN);
    if (chapterMatch) {
      flush();
      currentChapter = chapterMatch[1];
      continue;
    }

    // Check for section start
    const sectionMatch = line.match(SECTION_PATTERN);
    if (sectionMatch) {
      flush();
      currentSection = sectionMatch[1].replace(/\s+/g, ' ').trim();
      const remainder = sectionMatch[2].trim();
      if (remainder) {
        currentContent.push(remainder);
      }
      continue;
    }

    // Check for rubrik (title) — only if we just started a new section with no content yet
    if (currentSection && currentContent.length === 0 && RUBRIK_PATTERN.test(line)) {
      currentTitle = line;
      continue;
    }

    // Regular content line
    if (currentSection) {
      currentContent.push(line);
    }
  }

  flush();
  return provisions;
}

/**
 * Detect if a statute uses chapters (chaptered) or not (flat).
 */
export function isChapteredStatute(text: string): boolean {
  return CHAPTER_PATTERN.test(text);
}
