#!/usr/bin/env tsx
/**
 * Bulk-ingest a curated set of high-relevance Danish statutes.
 *
 * Usage:
 *   node --import tsx scripts/ingest-relevant-laws.ts
 *   node --import tsx scripts/ingest-relevant-laws.ts data/relevant-statutes.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ingest } from './ingest-riksdagen.js';

interface RelevantStatute {
  id: string;
  slug: string;
}

interface RelevantStatuteConfig {
  description?: string;
  statutes: RelevantStatute[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CONFIG_PATH = path.resolve(__dirname, '../data/relevant-statutes.json');
const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '../data/seed');

function safeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function run(): Promise<void> {
  const configPath = path.resolve(process.argv[2] ?? DEFAULT_CONFIG_PATH);
  const outputDir = DEFAULT_OUTPUT_DIR;

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configRaw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configRaw) as RelevantStatuteConfig;

  if (!Array.isArray(config.statutes) || config.statutes.length === 0) {
    throw new Error(`No statutes in config: ${configPath}`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Bulk Ingestion - Relevant Swedish Statutes');
  console.log(`  Config: ${configPath}`);
  console.log(`  Output dir: ${outputDir}`);
  if (config.description) {
    console.log(`  Description: ${config.description}`);
  }
  console.log(`  Total statutes: ${config.statutes.length}\n`);

  const failed: Array<{ id: string; error: string }> = [];
  let completed = 0;

  for (const statute of config.statutes) {
    const slug = safeFileName(statute.slug || statute.id.replace(':', '-'));
    const outputPath = path.join(outputDir, `${slug}.json`);

    try {
      await ingest(statute.id, outputPath);
      completed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ id: statute.id, error: message });
      console.error(`FAILED ${statute.id}: ${message}\n`);
    }
  }

  console.log('Bulk ingestion summary');
  console.log(`  Completed: ${completed}`);
  console.log(`  Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\nFailed IDs');
    for (const item of failed) {
      console.log(`  ${item.id} - ${item.error}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\nNext step: npm run build:db');
  }
}

run().catch(error => {
  console.error('Bulk ingestion failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});

