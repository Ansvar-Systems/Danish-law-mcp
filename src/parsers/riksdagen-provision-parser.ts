/**
 * Parser tuned for Riksdagen statute text dumps.
 *
 * Riksdagen text contains line-break artifacts and occasional table-of-contents
 * fragments. This parser uses conservative chapter activation and section
 * monotonicity checks to avoid mislabeling provisions.
 */

export interface RiksdagenProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title?: string;
  content: string;
}

export interface RiksdagenParseDiagnostics {
  ignored_chapter_markers: number;
  suppressed_section_candidates: number;
}

export interface RiksdagenParseResult {
  provisions: RiksdagenProvision[];
  diagnostics: RiksdagenParseDiagnostics;
}

const CHAPTER_PATTERN = /^(\d+)\s*kap\.\s*(.*)$/u;
const SECTION_PATTERN = /^(\d+\s*[a-z]?)\s*§\s*(.*)$/iu;
const LAW_NOTE_PATTERN = /^Lag \(\d{4}:\d+\)\.?$/u;

function normalizeSectionRef(section: string): string {
  return section.replace(/\s+/g, ' ').trim().toLowerCase();
}

function sectionNumber(section: string): number | undefined {
  const match = section.match(/^(\d+)/);
  if (!match) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

function sectionOrdinal(section: string): number | undefined {
  const match = section.match(/^(\d+)(?:\s*([a-z]))?$/i);
  if (!match) {
    return undefined;
  }
  const base = Number.parseInt(match[1], 10);
  const suffix = (match[2] ?? '').toLowerCase();
  if (!suffix) {
    return base * 100;
  }
  const offset = suffix.charCodeAt(0) - 96;
  return base * 100 + Math.max(offset, 0);
}

function startsWithLowercase(text: string): boolean {
  if (!text) {
    return false;
  }
  return /^[a-zåäö]/u.test(text);
}

function isLikelyTitle(line: string): boolean {
  return (
    line.length > 0 &&
    line.length < 100 &&
    /^[A-ZÅÄÖ]/u.test(line) &&
    !/^\d+\s*(kap\.|§)/u.test(line) &&
    !LAW_NOTE_PATTERN.test(line)
  );
}

export function parseRiksdagenProvisions(text: string): RiksdagenParseResult {
  const lines = text.split(/\r?\n/);
  const provisions: RiksdagenProvision[] = [];
  const seenProvisionRefs = new Set<string>();
  const lastOrdinalByChapter = new Map<string, number>();
  const diagnostics: RiksdagenParseDiagnostics = {
    ignored_chapter_markers: 0,
    suppressed_section_candidates: 0,
  };

  let currentChapter: string | undefined;
  let pendingChapter: string | undefined;

  let currentSection: string | undefined;
  let currentTitle: string | undefined;
  let pendingTitle: string | undefined;
  const currentContent: string[] = [];

  function flushCurrentSection(): void {
    if (!currentSection || currentContent.length === 0) {
      currentSection = undefined;
      currentTitle = undefined;
      currentContent.length = 0;
      return;
    }

    const section = normalizeSectionRef(currentSection);
    const provisionRef = currentChapter ? `${currentChapter}:${section}` : section;

    provisions.push({
      provision_ref: provisionRef,
      chapter: currentChapter,
      section,
      title: currentTitle,
      content: currentContent.join(' ').replace(/\s+/g, ' ').trim(),
    });

    seenProvisionRefs.add(provisionRef);

    if (currentChapter) {
      const ordinal = sectionOrdinal(section);
      if (ordinal !== undefined) {
        lastOrdinalByChapter.set(currentChapter, ordinal);
      }
    }

    currentSection = undefined;
    currentTitle = undefined;
    currentContent.length = 0;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const chapterMatch = line.match(CHAPTER_PATTERN);
    if (chapterMatch) {
      flushCurrentSection();
      pendingChapter = chapterMatch[1];
      pendingTitle = undefined;
      continue;
    }

    const sectionMatch = line.match(SECTION_PATTERN);
    if (sectionMatch) {
      const normalizedSection = normalizeSectionRef(sectionMatch[1]);
      const sectionNum = sectionNumber(normalizedSection);
      const remainder = sectionMatch[2].trim();

      let chapterForSection = currentChapter;
      let chapterActivated = false;

      if (pendingChapter) {
        if (!currentChapter || sectionNum === 1) {
          chapterForSection = pendingChapter;
          chapterActivated = chapterForSection !== currentChapter;
        } else {
          diagnostics.ignored_chapter_markers++;
        }
        pendingChapter = undefined;
      }

      const provisionRef = chapterForSection
        ? `${chapterForSection}:${normalizedSection}`
        : normalizedSection;

      const candidateOrdinal = sectionOrdinal(normalizedSection);
      const currentOrdinal = currentSection ? sectionOrdinal(currentSection) : undefined;
      const lastOrdinal = chapterForSection ? lastOrdinalByChapter.get(chapterForSection) : undefined;
      const candidateNumber = sectionNumber(normalizedSection);
      const currentNumber = currentSection ? sectionNumber(currentSection) : undefined;

      const isDuplicateRef = seenProvisionRefs.has(provisionRef);
      const isOutOfOrderFromCurrent = (
        currentOrdinal !== undefined &&
        candidateOrdinal !== undefined &&
        candidateOrdinal <= currentOrdinal
      );
      const isOutOfOrderFromHistory = (
        !chapterActivated &&
        lastOrdinal !== undefined &&
        candidateOrdinal !== undefined &&
        candidateOrdinal <= lastOrdinal
      );
      const isLikelyInlineReference = (
        !chapterActivated &&
        currentSection !== undefined &&
        currentContent.length > 0 &&
        startsWithLowercase(remainder)
      );
      const isSuspiciousFlatJump = (
        !chapterActivated &&
        !chapterForSection &&
        currentNumber !== undefined &&
        candidateNumber !== undefined &&
        candidateNumber - currentNumber >= 8 &&
        currentContent.length > 0
      );

      if (
        isDuplicateRef ||
        isOutOfOrderFromCurrent ||
        isOutOfOrderFromHistory ||
        isLikelyInlineReference ||
        isSuspiciousFlatJump
      ) {
        diagnostics.suppressed_section_candidates++;
        if (currentSection) {
          currentContent.push(line);
        }
        continue;
      }

      const titleForSection = pendingTitle;
      pendingTitle = undefined;
      flushCurrentSection();

      currentChapter = chapterForSection;
      currentSection = normalizedSection;
      currentTitle = titleForSection;

      if (remainder) {
        currentContent.push(remainder);
      }
      continue;
    }

    if (!currentSection && isLikelyTitle(line)) {
      pendingTitle = line;
      continue;
    }

    if (currentSection && currentContent.length === 0 && isLikelyTitle(line)) {
      currentTitle = line;
      continue;
    }

    if (currentSection) {
      currentContent.push(line);
    }
  }

  flushCurrentSection();

  return { provisions, diagnostics };
}
