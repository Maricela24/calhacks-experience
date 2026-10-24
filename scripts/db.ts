import { bootstrapDb, loadConfig, loadRootEnv, migrate, openDb, pendingMigrations } from "@afterhours/data";
import { rmSync } from "node:fs";

loadRootEnv();
const cmd = process.argv[2];
const config = loadConfig();

if (cmd === "migrate") {
  const db = openDb(config.databasePath);
  const applied = migrate(db);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "No pending migrations.");
  console.log(`Pending now: ${pendingMigrations(db).length}`);
  db.close();
} else if (cmd === "seed") {
  const db = bootstrapDb(config); // migrates, then seeds default settings only if absent
  console.log("Database ready; default settings present.");
  db.close();
} else if (cmd === "reset") {
  if (!process.argv.includes("--demo-only")) {
    console.error("Refusing to reset without --demo-only. Run: pnpm db:reset -- --demo-only");
    process.exit(1);
  }
  if (config.nodeEnv === "production") {
    console.error("Refusing to reset a production database.");
    process.exit(1);
  }
  const db = openDb(config.databasePath);
  const gmail = db.prepare("SELECT 1 FROM integrations WHERE provider='gmail' AND state != 'disconnected'").get();
  const gmailTasks = db.prepare("SELECT COUNT(*) n FROM tasks WHERE ingestion_mode='gmail'").get() as { n: number };
  db.close();
  if (gmail || gmailTasks.n > 0) {
    console.error("Refusing: database contains a Gmail connection or Gmail-ingested tasks, not demo-only data.");
    process.exit(1);
  }
  for (const suffix of ["", "-wal", "-shm"]) rmSync(config.databasePath + suffix, { force: true });
  rmSync(config.artifactsDir, { recursive: true, force: true });
  console.log("Demo data removed. Run pnpm db:migrate && pnpm db:seed.");
} else {
  console.error("Usage: tsx scripts/db.ts migrate|seed|reset");
  process.exit(1);
}
