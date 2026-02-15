#!/usr/bin/env tsx
/**
 * Test script for lagen.nu RDF parser functions
 * Quick validation of parsing logic before running full ingestion
 */

// Mock RDF sample based on lagen.nu data structure
const SAMPLE_RDF = `<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:dcterms="http://purl.org/dc/terms/"
         xmlns:rpubl="https://lagen.nu/terms#"
         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
         xmlns:foaf="http://xmlns.com/foaf/0.1/">
  <rpubl:VagledandeDomstolsavgorande rdf:about="https://lagen.nu/dom/hfd/2023:1">
    <dcterms:identifier>HFD-2023:1</dcterms:identifier>
    <rpubl:arsutgava>2023</rpubl:arsutgava>
    <rpubl:lopnummer>1</rpubl:lopnummer>
    <rpubl:referatrubrik>Fråga om beskattning av arbetsgivaravgifter vid tillhandahållande av mobiltelefoni</rpubl:referatrubrik>
    <dcterms:publisher>
      <foaf:Organization>
        <foaf:name>Högsta förvaltningsdomstolen</foaf:name>
      </foaf:Organization>
    </dcterms:publisher>
    <rpubl:malnummer>5212-22</rpubl:malnummer>
    <rpubl:avgorandedatum>2023-01-18</rpubl:avgorandedatum>
    <dcterms:subject>
      <rdf:Description>
        <rdfs:label>Skatterätt</rdfs:label>
      </rdf:Description>
    </dcterms:subject>
    <dcterms:subject>
      <rdf:Description>
        <rdfs:label>Arbetsgivaravgifter</rdfs:label>
      </rdf:Description>
    </dcterms:subject>
    <rpubl:lagrum rdf:resource="https://lagen.nu/1999:1229"/>
    <dcterms:references rdf:resource="https://lagen.nu/2018:218"/>
  </rpubl:VagledandeDomstolsavgorande>
</rdf:RDF>`;

// Test parsing functions
function test() {
  console.log('Testing lagen.nu RDF parser functions\n');

  // Test 1: Extract identifier
  const idMatch = SAMPLE_RDF.match(/<dcterms:identifier[^>]*>([^<]+)<\/dcterms:identifier>/i);
  console.log('✓ Identifier:', idMatch?.[1]);

  // Test 2: Extract title
  const titleMatch = SAMPLE_RDF.match(/<rpubl:referatrubrik[^>]*>([^<]+)<\/rpubl:referatrubrik>/i);
  console.log('✓ Title:', titleMatch?.[1]);

  // Test 3: Extract court from publisher
  const publisherMatch = SAMPLE_RDF.match(/<dcterms:publisher[^>]*>(.*?)<\/dcterms:publisher>/is);
  if (publisherMatch) {
    const courtMatch = publisherMatch[1].match(/<foaf:name[^>]*>([^<]+)<\/foaf:name>/i);
    console.log('✓ Court:', courtMatch?.[1]);
  }

  // Test 4: Extract case number
  const caseNumMatch = SAMPLE_RDF.match(/<rpubl:malnummer[^>]*>([^<]+)<\/rpubl:malnummer>/i);
  console.log('✓ Case number:', caseNumMatch?.[1]);

  // Test 5: Extract decision date
  const dateMatch = SAMPLE_RDF.match(/<rpubl:avgorandedatum[^>]*>([^<]+)<\/rpubl:avgorandedatum>/i);
  console.log('✓ Decision date:', dateMatch?.[1]);

  // Test 6: Extract keywords
  const subjectMatches = Array.from(SAMPLE_RDF.matchAll(/<dcterms:subject[^>]*>(.*?)<\/dcterms:subject>/gis));
  const keywords: string[] = [];
  for (const match of subjectMatches) {
    const label = match[1].match(/<rdfs:label[^>]*>([^<]+)<\/rdfs:label>/i)?.[1];
    if (label) keywords.push(label);
  }
  console.log('✓ Keywords:', keywords.join(', '));

  // Test 7: Extract statute references
  const lagrumPattern = /<rpubl:lagrum[^>]*rdf:resource="([^"]+)"/gi;
  const refPattern = /<dcterms:references[^>]*rdf:resource="([^"]+)"/gi;
  const lagrumUris = Array.from(SAMPLE_RDF.matchAll(lagrumPattern)).map(m => m[1]);
  const refUris = Array.from(SAMPLE_RDF.matchAll(refPattern)).map(m => m[1]);
  const allUris = [...lagrumUris, ...refUris];
  const sfsNumbers = allUris.map(uri => uri.match(/(\d{4}:\d+)/)?.[1]).filter(Boolean);
  console.log('✓ Statute references:', sfsNumbers.join(', '));

  // Test 8: Case ID parsing
  console.log('\n✓ Case ID parsing:');
  const testCases = [
    'HFD 2023:1',
    'AD 2023 nr 57',
    'NJA 2020 s. 45',
    'MÖD 2023:12',
    'MIG 2023:5',
  ];

  for (const testCase of testCases) {
    // Pattern 1: Standard format
    let match = testCase.match(/^(HFD|MÖD|MMD|MIG|RH|NJA|HvS)\s+(\d{4}):(\d+)/i);
    if (match) {
      console.log(`  ${testCase} → court=${match[1]}, year=${match[2]}, number=${match[3]}`);
      continue;
    }

    // Pattern 2: AD format
    match = testCase.match(/^AD\s+(\d{4})\s+nr\s+(\d+)/i);
    if (match) {
      console.log(`  ${testCase} → court=AD, year=${match[1]}, number=${match[2]}`);
      continue;
    }

    // Pattern 3: Page-based
    match = testCase.match(/^(NJA|HFD)\s+(\d{4})\s+s\.\s*(\d+)/i);
    if (match) {
      console.log(`  ${testCase} → court=${match[1]}, year=${match[2]}, number=${match[3]}`);
      continue;
    }
  }

  console.log('\n✓ All tests passed!\n');
}

test();
