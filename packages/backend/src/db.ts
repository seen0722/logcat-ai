import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

/**
 * Initialize the SQLite database: create the data directory and run migrations.
 * Must be called once at server startup before any database access.
 */
export function initDatabase(): void {
  const config = getConfig();
  const dbPath = config.dbPath;
  const dataDir = path.dirname(dbPath);

  // Ensure the data directory exists
  fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Run migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS analyses (
      id              TEXT PRIMARY KEY,
      filename        TEXT NOT NULL,
      file_size       INTEGER NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      device_model    TEXT,
      manufacturer    TEXT,
      android_ver     TEXT,
      health_overall  INTEGER,
      insight_count   INTEGER DEFAULT 0,
      critical_count  INTEGER DEFAULT 0,
      anr_count       INTEGER DEFAULT 0,
      result_json     TEXT NOT NULL,
      notes           TEXT,
      tags            TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS logcat_fts USING fts5(
      analysis_id,
      line_number,
      timestamp,
      level,
      tag,
      message,
      tokenize='porter unicode61'
    );
  `);

  console.log(`[logcat-ai] Database initialized at ${dbPath}`);
}

/**
 * Get the singleton Database instance.
 * Throws if initDatabase() has not been called yet.
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}
