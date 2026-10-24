import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Db = Database.Database;

export function openDb(file: string): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  return db;
}

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

export interface MigrationFile { version: number; name: string; sql: string }

export function readMigrations(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({
      version: Number(f.split("_")[0]),
      name: f,
      sql: readFileSync(path.join(dir, f), "utf8"),
    }));
}

/** Apply pending migrations in order. Safe to call from several processes at once. */
export function migrate(db: Db, now: Date = new Date(), files: MigrationFile[] = readMigrations()): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  const applied: string[] = [];
  const versions = files.map((f) => f.version);
  if (new Set(versions).size !== versions.length) throw new Error("Duplicate migration version numbers");
  for (const f of files) {
    db.transaction(() => {
      const done = db.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(f.version);
      if (done) return;
      db.exec(f.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
        f.version,
        f.name,
        now.toISOString(),
      );
      applied.push(f.name);
    }).immediate();
  }
  return applied;
}

export function pendingMigrations(db: Db, files: MigrationFile[] = readMigrations()): string[] {
  const has = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
  const done = new Set<number>(
    has ? (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map((r) => r.version) : [],
  );
  return files.filter((f) => !done.has(f.version)).map((f) => f.name);
}

export function inTx<T>(db: Db, fn: () => T): T {
  return db.transaction(fn).immediate();
}
