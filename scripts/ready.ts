// Startup readiness check. Makes no paid provider calls and no network calls.
import net from "node:net";
import { apiPortMismatch, bootstrapDb, loadConfig, loadRootEnv, pendingMigrations } from "@afterhours/data";

loadRootEnv();
let failed = false;
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed = true;
};

const portFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });

try {
  const config = loadConfig();
  check(true, "core configuration valid");
  const db = bootstrapDb(config);
  check(pendingMigrations(db).length === 0, "database migrated", config.databasePath.replace(config.repoRoot, "."));
  db.close();
  const mismatch = apiPortMismatch(config);
  check(mismatch === null, "API_PORT matches API_ORIGIN", mismatch ?? `${config.apiOrigin}`);
  check(await portFree(config.apiPort), `API port ${config.apiPort} available`, "FAIL here may just mean the API is already running");
  check(await portFree(3000), "web port 3000 available", "FAIL here may just mean the web app is already running");
  const engine = await import("@afterhours/engine");
  check(typeof engine.runWork === "function" && typeof engine.EngineError === "function", "@afterhours/engine exports load");
  const delivery = await import("@afterhours/delivery");
  check(typeof delivery.sendNotification === "function" && typeof delivery.composeNotification === "function", "@afterhours/delivery exports load");
  console.log(`Mode: generation=${config.generationMode}, notifications=${config.notificationChannel}, demo=${config.demoEnabled}`);
} catch (e) {
  check(false, "configuration/startup", e instanceof Error ? e.message : String(e));
}
process.exit(failed ? 1 : 0);
