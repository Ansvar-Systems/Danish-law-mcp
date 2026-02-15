#!/usr/bin/env tsx

/**
 * Survey EU references in Danish statute seed files
 * Identifies patterns and creates taxonomy
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

interface EUReference {
  type: 'directive' | 'regulation';
  id: string;
  year: number;
  number: number;
  community?: 'EU' | 'EG' | 'EEG' | 'Euratom';
  fullText: string;
  context: string;
  sfsNumber: string;
  sfsTitle: string;
}

// Regex patterns for EU references
const patterns = {
  // Directives: direktiv 2016/680, direktiv 95/46/EG, direktiv (EU) 2019/1152
  directive: [
    /direktiv\s+(?:\(([^)]+)\)\s+)?(\d{2,4})\/(\d+)(?:\/([A-Z]+))?/gi,
    /rådets direktiv\s+(?:\(([^)]+)\)\s+)?(\d{2,4})\/(\d+)(?:\/([A-Z]+))?/gi,
    /Europaparlamentets och rådets direktiv\s+(?:\(([^)]+)\)\s+)?(\d{2,4})\/(\d+)(?:\/([A-Z]+))?/gi,
  ],
  // Regulations: förordning (EU) 2016/679, förordning (EG) nr 765/2008
  regulation: [
    /förordning\s+(?:\(([^)]+)\)\s+)?(?:nr\s+)?(\d{2,4})\/(\d+)/gi,
    /rådets förordning\s+(?:\(([^)]+)\)\s+)?(?:nr\s+)?(\d{2,4})\/(\d+)/gi,
    /Europaparlamentets och rådets förordning\s+(?:\(([^)]+)\)\s+)?(?:nr\s+)?(\d{2,4})\/(\d+)/gi,
    /kommissionens förordning\s+(?:\(([^)]+)\)\s+)?(?:nr\s+)?(\d{2,4})\/(\d+)/gi,
    /kommissionens genomförandeförordning\s+(?:\(([^)]+)\)\s+)?(?:nr\s+)?(\d{2,4})\/(\d+)/gi,
    /kommissionens delegerade förordning\s+(?:\(([^)]+)\)\s+)?(?:nr\s+)?(\d{2,4})\/(\d+)/gi,
  ],
};

// Implementation keywords
const implementationKeywords = [
  'genomförande av',
  'kompletterar',
  'tillämpning av',
  'i enlighet med',
  'med stöd av',
];

function extractEUReferences(content: string, sfsNumber: string, sfsTitle: string): EUReference[] {
  const references: EUReference[] = [];
  const seen = new Set<string>();

  // Extract directives
  for (const pattern of patterns.directive) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const [fullText, community1, year, number, community2] = match;
      const community = (community1 || community2 || 'EU') as 'EU' | 'EG' | 'EEG' | 'Euratom';
      const id = `${year}/${number}`;
      const key = `directive:${id}`;

      if (seen.has(key)) continue;
      seen.add(key);

      // Get surrounding context (100 chars before and after)
      const index = match.index || 0;
      const contextStart = Math.max(0, index - 100);
      const contextEnd = Math.min(content.length, index + fullText.length + 100);
      const context = content.substring(contextStart, contextEnd).replace(/\s+/g, ' ');

      references.push({
        type: 'directive',
        id,
        year: parseInt(year),
        number: parseInt(number),
        community,
        fullText,
        context,
        sfsNumber,
        sfsTitle,
      });
    }
  }

  // Extract regulations
  for (const pattern of patterns.regulation) {
    const matches = content.matchAll(pattern);
    for (const match of matches) {
      const [fullText, community, year, number] = match;
      const id = `${year}/${number}`;
      const key = `regulation:${id}`;

      if (seen.has(key)) continue;
      seen.add(key);

      // Get surrounding context
      const index = match.index || 0;
      const contextStart = Math.max(0, index - 100);
      const contextEnd = Math.min(content.length, index + fullText.length + 100);
      const context = content.substring(contextStart, contextEnd).replace(/\s+/g, ' ');

      references.push({
        type: 'regulation',
        id,
        year: parseInt(year),
        number: parseInt(number),
        community: (community || 'EU') as 'EU' | 'EG' | 'EEG' | 'Euratom',
        fullText,
        context,
        sfsNumber,
        sfsTitle,
      });
    }
  }

  return references;
}

function main() {
  const seedDir = join(process.cwd(), 'data', 'seed');
  const files = readdirSync(seedDir).filter(f => f.endsWith('.json') && !f.startsWith('case-') && !f.startsWith('prep-'));

  console.log(`Analyzing ${files.length} statute files for EU references...\n`);

  const allReferences: EUReference[] = [];
  const statutesWithEU: string[] = [];
  const statutesWithoutEU: string[] = [];

  for (const file of files) {
    const filePath = join(seedDir, file);
    const content = readFileSync(filePath, 'utf-8');

    try {
      const data = JSON.parse(content);
      if (data.type !== 'statute') continue;

      const sfsNumber = data.id;
      const sfsTitle = data.title;
      const fullContent = JSON.stringify(data);

      const references = extractEUReferences(fullContent, sfsNumber, sfsTitle);

      if (references.length > 0) {
        statutesWithEU.push(`${sfsNumber} - ${sfsTitle} (${references.length} refs)`);
        allReferences.push(...references);
      } else {
        statutesWithoutEU.push(`${sfsNumber} - ${sfsTitle}`);
      }
    } catch (e) {
      console.error(`Error processing ${file}:`, e);
    }
  }

  // Statistics
  console.log('='.repeat(80));
  console.log('EU REFERENCE STATISTICS');
  console.log('='.repeat(80));
  console.log(`Total statutes analyzed: ${files.length}`);
  console.log(`Statutes with EU references: ${statutesWithEU.length}`);
  console.log(`Statutes without EU references: ${statutesWithoutEU.length}`);
  console.log(`Total EU references found: ${allReferences.length}`);
  console.log();

  // Breakdown by type
  const directives = allReferences.filter(r => r.type === 'directive');
  const regulations = allReferences.filter(r => r.type === 'regulation');
  console.log(`- Directives: ${directives.length}`);
  console.log(`- Regulations: ${regulations.length}`);
  console.log();

  // Most cited EU documents
  const citationCounts = new Map<string, { count: number; type: string; statutes: Set<string> }>();

  for (const ref of allReferences) {
    const key = `${ref.type}:${ref.id}`;
    if (!citationCounts.has(key)) {
      citationCounts.set(key, { count: 0, type: ref.type, statutes: new Set() });
    }
    const entry = citationCounts.get(key)!;
    entry.count++;
    entry.statutes.add(ref.sfsNumber);
  }

  const topCitations = Array.from(citationCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  console.log('TOP 20 MOST CITED EU DOCUMENTS:');
  console.log('-'.repeat(80));
  for (const [id, { count, type, statutes }] of topCitations) {
    console.log(`${id.padEnd(35)} ${count.toString().padStart(3)} citations in ${statutes.size} statutes`);
  }
  console.log();

  // Community breakdown
  const communityBreakdown = new Map<string, number>();
  for (const ref of allReferences) {
    const community = ref.community || 'Unknown';
    communityBreakdown.set(community, (communityBreakdown.get(community) || 0) + 1);
  }

  console.log('COMMUNITY BREAKDOWN:');
  console.log('-'.repeat(80));
  for (const [community, count] of Array.from(communityBreakdown.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`${community.padEnd(10)} ${count} references`);
  }
  console.log();

  // Examples of each pattern type
  console.log('PATTERN EXAMPLES:');
  console.log('-'.repeat(80));

  const exampleDirective = directives.find(r => r.community === 'EU');
  if (exampleDirective) {
    console.log(`EU Directive: ${exampleDirective.fullText}`);
    console.log(`  Context: ${exampleDirective.context.substring(0, 150)}...`);
    console.log();
  }

  const exampleEGDirective = directives.find(r => r.community === 'EG');
  if (exampleEGDirective) {
    console.log(`EG Directive: ${exampleEGDirective.fullText}`);
    console.log(`  Context: ${exampleEGDirective.context.substring(0, 150)}...`);
    console.log();
  }

  const exampleRegulation = regulations.find(r => r.community === 'EU');
  if (exampleRegulation) {
    console.log(`EU Regulation: ${exampleRegulation.fullText}`);
    console.log(`  Context: ${exampleRegulation.context.substring(0, 150)}...`);
    console.log();
  }

  // Statutes with most EU references
  const statuteRefCounts = new Map<string, { title: string; count: number }>();
  for (const ref of allReferences) {
    if (!statuteRefCounts.has(ref.sfsNumber)) {
      statuteRefCounts.set(ref.sfsNumber, { title: ref.sfsTitle, count: 0 });
    }
    statuteRefCounts.get(ref.sfsNumber)!.count++;
  }

  const topStatutes = Array.from(statuteRefCounts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);

  console.log('TOP 10 STATUTES WITH MOST EU REFERENCES:');
  console.log('-'.repeat(80));
  for (const [sfsNumber, { title, count }] of topStatutes) {
    console.log(`${sfsNumber.padEnd(12)} ${count.toString().padStart(3)} refs - ${title.substring(0, 50)}`);
  }
  console.log();

  // Purely domestic statutes (no EU refs)
  console.log('STATUTES WITHOUT EU REFERENCES (purely domestic):');
  console.log('-'.repeat(80));
  console.log(`Total: ${statutesWithoutEU.length}`);
  for (const statute of statutesWithoutEU.slice(0, 15)) {
    console.log(`- ${statute}`);
  }
  if (statutesWithoutEU.length > 15) {
    console.log(`... and ${statutesWithoutEU.length - 15} more`);
  }
  console.log();

  // Save full results to JSON
  const results = {
    summary: {
      totalStatutes: files.length,
      statutesWithEU: statutesWithEU.length,
      statutesWithoutEU: statutesWithoutEU.length,
      totalReferences: allReferences.length,
      directives: directives.length,
      regulations: regulations.length,
    },
    topCitations: topCitations.map(([id, data]) => ({
      id,
      type: data.type,
      count: data.count,
      statuteCount: data.statutes.size,
    })),
    allReferences,
    statutesWithEU,
    statutesWithoutEU,
  };

  const outputPath = join(process.cwd(), 'data', 'eu-references-analysis.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Full results saved to: ${outputPath}`);
}

main();
