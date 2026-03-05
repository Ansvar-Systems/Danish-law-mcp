import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import Database from '@ansvar/mcp-sqlite';
import { existsSync, createWriteStream, rmSync, renameSync } from 'fs';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import https from 'https';
import type { IncomingMessage } from 'http';

import { registerTools } from '../src/tools/registry.js';

// ---------------------------------------------------------------------------
// Server identity
// ---------------------------------------------------------------------------

const SERVER_NAME = 'danish-legal-citations';
const SERVER_VERSION = '1.0.1';

// ---------------------------------------------------------------------------
// Database — downloaded from GitHub Releases on cold start
// ---------------------------------------------------------------------------

const TMP_DB = '/tmp/database.db';
const TMP_DB_TMP = '/tmp/database.db.tmp';
const TMP_DB_LOCK = '/tmp/database.db.lock';

const GITHUB_REPO = 'Ansvar-Systems/Denmark-law-mcp';
const RELEASE_TAG = `v${SERVER_VERSION}`;
const ASSET_NAME = 'danish-free.db.gz';
const ALLOW_RUNTIME_DB_DOWNLOAD = process.env.DANISH_LAW_ALLOW_RUNTIME_DOWNLOAD === '1';

let db: InstanceType<typeof Database> | null = null;

function httpsGet(url: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': SERVER_NAME } }, resolve)
      .on('error', reject);
  });
}

async function downloadDatabase(): Promise<void> {
  const url = `https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_TAG}/${ASSET_NAME}`;

  let response = await httpsGet(url);

  // Follow up to 5 redirects (GitHub redirects to S3)
  let redirects = 0;
  while (
    response.statusCode &&
    response.statusCode >= 300 &&
    response.statusCode < 400 &&
    response.headers.location &&
    redirects < 5
  ) {
    response = await httpsGet(response.headers.location);
    redirects++;
  }

  if (response.statusCode !== 200) {
    throw new Error(
      `Failed to download database: HTTP ${response.statusCode} from ${url}`,
    );
  }

  const gunzip = createGunzip();
  const out = createWriteStream(TMP_DB_TMP);
  await pipeline(response, gunzip, out);
  renameSync(TMP_DB_TMP, TMP_DB);
}

async function ensureDatabase(): Promise<InstanceType<typeof Database>> {
  if (db) return db;

  // Clean stale artifacts from previous invocations
  if (existsSync(TMP_DB_LOCK)) {
    rmSync(TMP_DB_LOCK, { recursive: true, force: true });
  }

  if (!existsSync(TMP_DB)) {
    const envDb = process.env.DANISH_LAW_DB_PATH;
    if (envDb && existsSync(envDb)) {
      // Local dev: use env-specified DB directly
      db = new Database(envDb, { readonly: true });
      db.pragma('foreign_keys = ON');
      return db;
    }

    if (!ALLOW_RUNTIME_DB_DOWNLOAD) {
      throw new Error(
        'database_unavailable: set DANISH_LAW_DB_PATH or enable DANISH_LAW_ALLOW_RUNTIME_DOWNLOAD=1',
      );
    }

    console.log('[danish-law-mcp] Downloading free-tier database...');
    await downloadDatabase();
    console.log('[danish-law-mcp] Database ready');
  }

  db = new Database(TMP_DB, { readonly: true });
  db.pragma('foreign_keys = ON');
  return db;
}

function registerDegradedTools(server: Server, reason: string): void {
  const tools: Tool[] = [
    {
      name: 'about',
      description: 'Service metadata and current runtime availability status.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    if (toolName !== 'about') {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Service is temporarily in degraded mode: ${reason}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              name: SERVER_NAME,
              version: SERVER_VERSION,
              status: 'degraded',
              message:
                'Database is currently unavailable. Configure DANISH_LAW_DB_PATH or enable DANISH_LAW_ALLOW_RUNTIME_DOWNLOAD=1.',
              reason,
            },
            null,
            2,
          ),
        },
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// Vercel handler
// ---------------------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocol: 'mcp-streamable-http',
    });
    return;
  }

  try {
    const server = new Server(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } }
    );

    try {
      const database = await ensureDatabase();
      registerTools(server, database);
    } catch (dbErr: unknown) {
      const reason = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error('Danish MCP degraded mode:', reason);
      registerDegradedTools(server, reason);
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('MCP handler error:', message);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
}
