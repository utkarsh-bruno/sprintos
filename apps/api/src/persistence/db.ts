import Database from 'better-sqlite3';
import path from 'node:path';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ?? path.resolve(dirname, '../../../../data');
const DB_PATH = process.env.DATABASE_PATH ?? path.join(DATA_DIR, 'sprintos.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    const sql = readFileSync(path.join(dirname, 'migrations/001_initial.sql'), 'utf-8');
    db.exec(sql);
  }
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}
