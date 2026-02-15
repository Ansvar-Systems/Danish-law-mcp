#!/usr/bin/env tsx

/**
 * Extract EU References from Swedish Statutes
 *
 * Generates seed data for eu_references table by:
 * 1. Parsing all statute seed files
 * 2. Extracting EU references from provisions
 * 3. Creating structured reference data
 * 4. Outputting JSON seed file
 */

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  extractEUReferences,
  generateEUDocumentId,
  generateCELEXNumber,
  type EUReference,
} from '../src/parsers/eu-reference-parser.js';

interface StatuteSeedData {
  id: string;
  type: string;
  title: string;
  provisions?: Array<{
    provision_ref: string;
    chapter?: string;
    section: string;
    content: string;
  }>;
}

interface EUDocumentData {
  id: string;
  type: 'directive' | 'regulation';
  year: number;
  number: number;
  community: string;
  celex_number: string;
  title?: string;
  short_name?: string;
  in_force: boolean;
}

interface EUReferenceData {
  source_type: 'provision' | 'document';
  source_id: string;
  document_id: string; // SFS number
  provision_ref?: string;
  eu_document_id: string;
  eu_article?: string;
  reference_type: string;
  reference_context: string;
  full_citation: string;
  is_primary_implementation: boolean;
}

interface ExtractionResults {
  eu_documents: EUDocumentData[];
  eu_references: EUReferenceData[];
  statistics: {
    totalStatutes: number;
    statutesWithEU: number;
    totalReferences: number;
    totalDirectives: number;
    totalRegulations: number;
    topEUDocuments: Array<{ id: string; count: number }>;
  };
}

function main() {
  const seedDir = join(process.cwd(), 'data', 'seed');
  const files = readdirSync(seedDir).filter(
    f => f.endsWith('.json') && !f.startsWith('case-') && !f.startsWith('prep-')
  );

  console.log(`Processing ${files.length} statute files...\n`);

  const euDocumentsMap = new Map<string, EUDocumentData>();
  const euReferences: EUReferenceData[] = [];
  let statutesProcessed = 0;
  let statutesWithEU = 0;

  for (const file of files) {
    const filePath = join(seedDir, file);
    const content = readFileSync(filePath, 'utf-8');

    try {
      const data: StatuteSeedData = JSON.parse(content);
      if (data.type !== 'statute') continue;

      statutesProcessed++;

      const sfsNumber = data.id;
      const sfsTitle = data.title;
      let hasEUReferences = false;

      // Extract from document-level content
      const fullContent = JSON.stringify(data);
      const docLevelRefs = extractEUReferences(fullContent);

      // Track which EU documents are mentioned for primary implementation detection
      const mentionedInTitle = extractEUReferences(sfsTitle);
      const primaryEUDocs = new Set(mentionedInTitle.map(r => generateEUDocumentId(r)));

      // Process provisions
      if (data.provisions) {
        for (const provision of data.provisions) {
          const provisionText = provision.content;
          const refs = extractEUReferences(provisionText);

          for (const ref of refs) {
            hasEUReferences = true;
            const euDocId = generateEUDocumentId(ref);

            // Add to EU documents map
            if (!euDocumentsMap.has(euDocId)) {
              euDocumentsMap.set(euDocId, {
                id: euDocId,
                type: ref.type,
                year: ref.year,
                number: ref.number,
                community: ref.community || 'EU',
                celex_number: generateCELEXNumber(ref),
                short_name: undefined,
                in_force: true,
              });
            }

            // Add reference
            euReferences.push({
              source_type: 'provision',
              source_id: `${sfsNumber}:${provision.provision_ref}`,
              document_id: sfsNumber,
              provision_ref: provision.provision_ref,
              eu_document_id: euDocId,
              eu_article: ref.article,
              reference_type: ref.referenceType || 'references',
              reference_context: ref.context.substring(0, 200),
              full_citation: ref.fullText,
              is_primary_implementation: primaryEUDocs.has(euDocId),
            });
          }
        }
      }

      // Add document-level references not caught in provisions
      const provisionEUDocs = new Set(
        euReferences
          .filter(r => r.document_id === sfsNumber)
          .map(r => r.eu_document_id)
      );

      for (const ref of docLevelRefs) {
        const euDocId = generateEUDocumentId(ref);
        if (!provisionEUDocs.has(euDocId)) {
          hasEUReferences = true;

          // Add to EU documents map
          if (!euDocumentsMap.has(euDocId)) {
            euDocumentsMap.set(euDocId, {
              id: euDocId,
              type: ref.type,
              year: ref.year,
              number: ref.number,
              community: ref.community || 'EU',
              celex_number: generateCELEXNumber(ref),
              in_force: true,
            });
          }

          // Add document-level reference
          euReferences.push({
            source_type: 'document',
            source_id: sfsNumber,
            document_id: sfsNumber,
            eu_document_id: euDocId,
            eu_article: ref.article,
            reference_type: ref.referenceType || 'references',
            reference_context: ref.context.substring(0, 200),
            full_citation: ref.fullText,
            is_primary_implementation: primaryEUDocs.has(euDocId),
          });
        }
      }

      if (hasEUReferences) {
        statutesWithEU++;
        console.log(`✓ ${sfsNumber} - ${sfsTitle.substring(0, 60)}`);
      }
    } catch (e) {
      console.error(`✗ Error processing ${file}:`, e);
    }
  }

  // Statistics
  const euDocuments = Array.from(euDocumentsMap.values());
  const directiveCount = euDocuments.filter(d => d.type === 'directive').length;
  const regulationCount = euDocuments.filter(d => d.type === 'regulation').length;

  // Count references per EU document
  const refCounts = new Map<string, number>();
  for (const ref of euReferences) {
    refCounts.set(ref.eu_document_id, (refCounts.get(ref.eu_document_id) || 0) + 1);
  }

  const topEUDocuments = Array.from(refCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id, count]) => ({ id, count }));

  const results: ExtractionResults = {
    eu_documents: euDocuments.sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      if (a.year !== b.year) return b.year - a.year;
      return b.number - a.number;
    }),
    eu_references: euReferences.sort((a, b) => {
      if (a.document_id !== b.document_id) return a.document_id.localeCompare(b.document_id);
      return (a.provision_ref || '').localeCompare(b.provision_ref || '');
    }),
    statistics: {
      totalStatutes: statutesProcessed,
      statutesWithEU,
      totalReferences: euReferences.length,
      totalDirectives: directiveCount,
      totalRegulations: regulationCount,
      topEUDocuments,
    },
  };

  // Output results
  console.log('\n' + '='.repeat(80));
  console.log('EXTRACTION RESULTS');
  console.log('='.repeat(80));
  console.log(`Statutes processed: ${statutesProcessed}`);
  console.log(`Statutes with EU references: ${statutesWithEU}`);
  console.log(`Unique EU documents: ${euDocuments.length}`);
  console.log(`  - Directives: ${directiveCount}`);
  console.log(`  - Regulations: ${regulationCount}`);
  console.log(`Total references: ${euReferences.length}`);
  console.log();

  console.log('TOP 20 EU DOCUMENTS BY REFERENCE COUNT:');
  console.log('-'.repeat(80));
  for (const { id, count } of topEUDocuments) {
    console.log(`${id.padEnd(30)} ${count.toString().padStart(4)} references`);
  }
  console.log();

  // Save to file
  const outputPath = join(process.cwd(), 'data', 'seed', 'eu-references.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Results saved to: ${outputPath}`);
  console.log();
  console.log('Next steps:');
  console.log('1. Review eu-references.json');
  console.log('2. Add EU document titles and short names (from EUR-Lex)');
  console.log('3. Run database migration to add eu_documents and eu_references tables');
  console.log('4. Import seed data: npm run import:eu-references');
}

main();
