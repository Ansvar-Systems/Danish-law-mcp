#!/usr/bin/env tsx
/**
 * Debug script to examine Riksdagen API response format
 */

const RIKSDAGEN_DOC_URL = 'https://data.riksdagen.se/dokument';
const RIKSDAGEN_LIST_URL = 'https://data.riksdagen.se/dokumentlista';
const USER_AGENT = 'Swedish-Law-MCP/0.1.0';

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function debugRiksdagen(sfsNumber: string): Promise<void> {
  console.log('=== Riksdagen API Debug ===\n');

  // Fetch document list
  const listUrl = `${RIKSDAGEN_LIST_URL}/?sok=${encodeURIComponent(sfsNumber)}&doktyp=sfs&format=json&utformat=json`;
  const listData = await fetchJson(listUrl) as { dokumentlista?: { dokument?: any[] } };
  const documents = listData?.dokumentlista?.dokument ?? [];

  if (documents.length === 0) {
    console.error('No documents found');
    process.exit(1);
  }

  const doc = documents[0];
  console.log(`Document: ${doc.titel}`);
  console.log(`ID: ${doc.dok_id}\n`);

  // Fetch full document
  const docUrl = `${RIKSDAGEN_DOC_URL}/${doc.dok_id}.json`;
  const docData = await fetchJson(docUrl) as { dokumentstatus?: { dokument?: any } };
  const fullDoc = docData?.dokumentstatus?.dokument;

  if (!fullDoc) {
    console.error('Could not retrieve document');
    process.exit(1);
  }

  const rawText = fullDoc.text || '';

  console.log(`Raw text length: ${rawText.length} chars\n`);
  console.log('=== First 2000 characters ===\n');
  console.log(rawText.substring(0, 2000));
  console.log('\n=== Searching for Chapter 3 Section 1 ===\n');

  // Find chapter 3
  const chapter3Start = rawText.indexOf('3 kap.');
  if (chapter3Start !== -1) {
    const excerpt = rawText.substring(chapter3Start, chapter3Start + 1500);
    console.log(excerpt);
  }

  console.log('\n=== Line-by-line analysis (first 50 lines after "3 kap.") ===\n');
  if (chapter3Start !== -1) {
    const excerpt = rawText.substring(chapter3Start, chapter3Start + 2000);
    const lines = excerpt.split('\n');

    for (let i = 0; i < Math.min(50, lines.length); i++) {
      const line = lines[i];
      const trimmed = line.trim();
      console.log(`Line ${i}: [${trimmed.length} chars] "${trimmed.substring(0, 100)}"`);

      // Check if it matches section pattern
      if (/^\d+\s*[a-z]?\s*§/.test(trimmed)) {
        console.log(`  ^^^ SECTION MATCH`);
      }

      // Check if it looks like a title (short, uppercase start)
      if (trimmed.length > 0 && trimmed.length < 80 && /^[A-ZÅÄÖ]/.test(trimmed) && !trimmed.includes('§')) {
        console.log(`  ^^^ POSSIBLE TITLE`);
      }
    }
  }
}

const sfsNumber = process.argv[2] || '1958:637';
debugRiksdagen(sfsNumber).catch(error => {
  console.error('Debug failed:', error.message);
  process.exit(1);
});
