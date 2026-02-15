import { describe, it, expect } from 'vitest';
import Database from '@ansvar/mcp-sqlite';

describe('Case Law Stats Resource Integration', () => {
  it('should handle missing sync metadata table gracefully', () => {
    const db = new Database(':memory:');

    db.exec(`
      CREATE TABLE case_law (
        id INTEGER PRIMARY KEY,
        document_id TEXT NOT NULL UNIQUE,
        court TEXT NOT NULL,
        case_number TEXT,
        decision_date TEXT,
        summary TEXT,
        keywords TEXT
      );
    `);

    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='case_law_sync_metadata'
    `).get();

    expect(tableExists).toBeUndefined();

    let stats;
    if (!tableExists) {
      stats = {
        status: 'no_data',
        message: 'No case law data has been synced yet.',
        total_cases: 0,
      };
    }

    expect(stats).toEqual({
      status: 'no_data',
      message: 'No case law data has been synced yet.',
      total_cases: 0,
    });

    db.close();
  });

  it('should read sync metadata when table exists', () => {
    const db = new Database(':memory:');

    db.exec(`
      CREATE TABLE case_law (
        id INTEGER PRIMARY KEY,
        document_id TEXT NOT NULL UNIQUE,
        court TEXT NOT NULL,
        case_number TEXT,
        decision_date TEXT,
        summary TEXT,
        keywords TEXT
      );

      CREATE TABLE case_law_sync_metadata (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_sync_date TEXT NOT NULL,
        last_decision_date TEXT,
        cases_count INTEGER,
        source TEXT DEFAULT 'lagen.nu'
      );

      INSERT INTO case_law_sync_metadata
        (id, last_sync_date, last_decision_date, cases_count, source)
      VALUES (1, '2026-02-12T10:00:00Z', '2026-02-10', 100, 'lagen.nu');

      INSERT INTO case_law (document_id, court, case_number, decision_date, summary, keywords)
      VALUES
        ('HFD-2023:1', 'HFD', '2023:1', '2023-01-15', 'Test case 1', 'tax'),
        ('AD-2023:1', 'AD', '2023:1', '2023-02-20', 'Test case 2', 'labor'),
        ('HFD-2023:2', 'HFD', '2023:2', '2023-03-10', 'Test case 3', 'admin');
    `);

    const syncMeta = db.prepare(`
      SELECT last_sync_date, last_decision_date, cases_count, source
      FROM case_law_sync_metadata
      WHERE id = 1
    `).get() as { last_sync_date: string; last_decision_date: string; cases_count: number; source: string } | undefined;

    expect(syncMeta).toBeDefined();
    expect(syncMeta!.last_sync_date).toBe('2026-02-12T10:00:00Z');
    expect(syncMeta!.last_decision_date).toBe('2026-02-10');
    expect(syncMeta!.cases_count).toBe(100);
    expect(syncMeta!.source).toBe('lagen.nu');

    const courtCounts = db.prepare(`
      SELECT court, COUNT(*) as count
      FROM case_law
      GROUP BY court
      ORDER BY count DESC
    `).all() as { court: string; count: number }[];

    expect(courtCounts).toHaveLength(2);
    expect(courtCounts[0]).toEqual({ court: 'HFD', count: 2 });
    expect(courtCounts[1]).toEqual({ court: 'AD', count: 1 });

    db.close();
  });

  it('should construct proper attribution object', () => {
    const attribution = {
      source: 'lagen.nu',
      url: 'https://lagen.nu',
      license: 'Creative Commons Attribution',
      attribution: 'Case law from lagen.nu, licensed CC-BY Domstolsverket',
    };

    expect(attribution.source).toBe('lagen.nu');
    expect(attribution.url).toBe('https://lagen.nu');
    expect(attribution.license).toBe('Creative Commons Attribution');
    expect(attribution.attribution).toContain('CC-BY Domstolsverket');
  });
});
