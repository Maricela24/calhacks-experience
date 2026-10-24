import type { AppConfig } from "./config";
import { migrate, openDb, type Db } from "./db";
import { loadOrganizationFixture } from "./demo";
import { defaultSettings, seedSettings } from "./settings";

/** Open the database, apply pending migrations, and seed default settings (idempotent). */
export function bootstrapDb(config: AppConfig, now: Date = new Date()): Db {
  const db = openDb(config.databasePath);
  migrate(db, now);
  seedSettings(db, defaultSettings(loadOrganizationFixture(config.repoRoot), config.notificationChannel), now);
  return db;
}
