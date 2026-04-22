import * as fs from 'fs';
import * as path from 'path';

export interface DayRecord {
  blog?: boolean;
  tokens?: number;
  sessions?: number;
  projects?: Record<string, number>; // cwd -> tokens
}

export interface DB {
  schema_version: 1;
  last_known_entry_date: string | null;
  days: Record<string, DayRecord>;
}

const EMPTY_DB: DB = {
  schema_version: 1,
  last_known_entry_date: null,
  days: {},
};

export function loadDB(dbPath: string): DB {
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(raw) as DB;
    if (!parsed.days) parsed.days = {};
    if (parsed.last_known_entry_date === undefined) parsed.last_known_entry_date = null;
    return parsed;
  } catch {
    return { ...EMPTY_DB, days: {} };
  }
}

export function saveDB(db: DB, dbPath: string): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}
