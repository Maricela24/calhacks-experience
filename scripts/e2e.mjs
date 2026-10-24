// Browser acceptance tests (Person 3). Starts an isolated API, worker, and web app on temporary storage
// (never the working database), runs the Playwright suite in tests/e2e, then cleans up.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = path.resolve(import.meta.dirname, "..");
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3100";
const API_PORT = process.env.E2E_API_PORT ?? "4100";
const tmp = mkdtempSync(path.join(tmpdir(), "afterhours-e2e-"));
const password = `e2e-${randomBytes(6).toString("hex")}`;
const cliToken = randomBytes(24).toString("base64url");

const env = {
  ...process.env,
  NODE_ENV: "development",
  PUBLIC_APP_URL: `http://localhost:${WEB_PORT}`,
  API_ORIGIN: `http://127.0.0.1:${API_PORT}`,
  API_PORT,
  DATABASE_PATH: path.join(tmp, "e2e.sqlite"),
  ARTIFACTS_DIR: path.join(tmp, "artifacts"),
  SESSION_SECRET: randomBytes(32).toString("hex"),
  APP_PASSWORD: password,
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  DEMO_ENABLED: "true",
  DEMO_CLI_TOKEN: cliToken,
  GENERATION_MODE: "fixture",
  MODEL_PROVIDER: "fixture",
  NOTIFICATION_CHANNEL: "outbox",
  GOOGLE_CLIENT_ID: "",
  GOOGLE_CLIENT_SECRET: "",
  WHATSAPP_USE_CASE_ELIGIBLE: "false",
  E2E_BASE_URL: `http://localhost:${WEB_PORT}`,
  E2E_PASSWORD: password,
  E2E_CLI_TOKEN: cliToken,
};

const children = [];
function start(name, args) {
  const child = spawn("pnpm", args, { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const log = [];
  for (const s of [child.stdout, child.stderr]) s.on("data", (d) => { log.push(String(d)); if (log.length > 200) log.shift(); });
  child.log = log;
  child.name = name;
  children.push(child);
  return child;
}
function cleanup() {
  for (const c of children) {
    try { process.kill(-c.pid, "SIGTERM"); } catch { /* already gone */ }
  }
  rmSync(tmp, { recursive: true, force: true });
}
process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

async function waitFor(url, label, ms = 180_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const c of children) {
      if (c.exitCode !== null) throw new Error(`${c.name} exited early:\n${c.log.join("")}`);
    }
    try {
      const res = await globalThis.fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

let code = 1;
try {
  for (const step of ["db:migrate", "db:seed"]) {
    const r = spawnSync("pnpm", [step], { cwd: root, env, stdio: "pipe" });
    if (r.status !== 0) throw new Error(`pnpm ${step} failed:\n${r.stdout}${r.stderr}`);
  }
  start("api", ["--filter", "@afterhours/api", "exec", "tsx", "src/main.ts"]);
  start("worker", ["--filter", "@afterhours/worker", "exec", "tsx", "src/main.ts"]);
  start("web", ["--filter", "@afterhours/web", "exec", "next", "dev", "-p", WEB_PORT]);
  await waitFor(`http://127.0.0.1:${API_PORT}/health`, "API");
  await waitFor(`http://localhost:${WEB_PORT}/login`, "web app");
  console.log(`E2E stack ready (web :${WEB_PORT}, api :${API_PORT}, storage ${tmp})`);
  const run = spawnSync(
    "pnpm",
    ["--filter", "@afterhours/web", "exec", "playwright", "test", "-c", path.join(root, "tests/e2e/playwright.config.ts"), ...process.argv.slice(2)],
    { cwd: root, env, stdio: "inherit" },
  );
  code = run.status ?? 1;
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
} finally {
  cleanup();
}
process.exit(code);
