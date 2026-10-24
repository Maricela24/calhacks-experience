import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { getTaskDetail, openDb, type AppConfig, type Db } from "@afterhours/data";
import { makeTestConfig, makeTestDb } from "@afterhours/data/testing";
import { buildApp } from "../src/app";

const ORIGIN = "http://localhost:3000";
const CLI = { authorization: "Bearer cli-token-for-tests" };
let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); app = undefined; });

async function boot(config: AppConfig, db: Db) {
  app = await buildApp({ config, db, rateLimit: false });
  return app;
}

async function login(a: FastifyInstance): Promise<string> {
  const r = await a.inject({ method: "POST", url: "/v1/session", headers: { origin: ORIGIN }, payload: { password: "correct-horse-battery" } });
  return (r.headers["set-cookie"] as string).split(";")[0]!;
}

const count = (db: Db, sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { n: number }).n;

describe("batch 2: concurrent replay-key dedupe", () => {
  it("25 simultaneous HTTP injections with one replayKey create one task and one job", async () => {
    const config = makeTestConfig();
    const { db } = makeTestDb(config);
    const a = await boot(config, db);
    const results = await Promise.all(
      Array.from({ length: 25 }, () => a.inject({ method: "POST", url: "/v1/demo/inject", headers: CLI, payload: { scenario: "proposal", replayKey: "race-1" } })),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const data = results.map((r) => r.json().data as { taskId: string; deduplicated: boolean });
    expect(new Set(data.map((d) => d.taskId)).size).toBe(1);
    expect(data.filter((d) => !d.deduplicated)).toHaveLength(1);
    expect(count(db, "SELECT COUNT(*) n FROM tasks")).toBe(1);
    expect(count(db, "SELECT COUNT(*) n FROM jobs")).toBe(1);
    expect(count(db, "SELECT COUNT(*) n FROM intake_messages")).toBe(1);
  });

  it("separate OS processes sharing one SQLite file also converge on one task and one job", async () => {
    const config = makeTestConfig();
    const { db } = makeTestDb(config);
    const run = () => new Promise<{ kind: string; taskId: string; deduplicated: boolean }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", `${import.meta.dirname}/support/inject-child.ts`, config.databasePath, "race-procs"], {
        cwd: config.repoRoot, stdio: ["ignore", "pipe", "pipe"],
      });
      let out = ""; let err = "";
      child.stdout.on("data", (d: Buffer) => { out += d; });
      child.stderr.on("data", (d: Buffer) => { err += d; });
      child.on("exit", (code) => (code === 0 ? resolve(JSON.parse(out.trim().split("\n").pop()!)) : reject(new Error(`child ${code}: ${err.slice(0, 300)}`))));
    });
    const results = await Promise.all(Array.from({ length: 6 }, run));
    expect(new Set(results.map((r) => r.taskId)).size).toBe(1);
    expect(results.filter((r) => !r.deduplicated)).toHaveLength(1);
    expect(count(db, "SELECT COUNT(*) n FROM tasks")).toBe(1);
    expect(count(db, "SELECT COUNT(*) n FROM jobs")).toBe(1);
  }, 60_000);

  it("a replay across a restart (new connection) still dedupes", async () => {
    const config = makeTestConfig();
    const first = makeTestDb(config);
    const a = await boot(config, first.db);
    const one = await a.inject({ method: "POST", url: "/v1/demo/inject", headers: CLI, payload: { scenario: "report", replayKey: "restart-key" } });
    await a.close(); app = undefined; first.db.close();
    const db2 = openDb(config.databasePath);
    const b = await boot(config, db2);
    const two = await b.inject({ method: "POST", url: "/v1/demo/inject", headers: CLI, payload: { scenario: "report", replayKey: "restart-key" } });
    expect(two.json().data).toEqual({ taskId: one.json().data.taskId, deduplicated: true });
  });
});

describe("batch 2: API returns before generation", () => {
  it("inject only enqueues: task is queued with one queued job and only an intake event; no worker involved", async () => {
    const config = makeTestConfig();
    const { db } = makeTestDb(config);
    const a = await boot(config, db);
    const t0 = Date.now();
    const r = await a.inject({ method: "POST", url: "/v1/demo/inject", headers: CLI, payload: { scenario: "proposal", replayKey: "fast" } });
    const elapsed = Date.now() - t0;
    expect(r.statusCode).toBe(200);
    expect(elapsed).toBeLessThan(2000);
    const cookie = await login(a);
    const detail = (await a.inject({ method: "GET", url: `/v1/tasks/${r.json().data.taskId}`, headers: { cookie } })).json().data;
    expect(detail.task).toMatchObject({ status: "queued", revision: 1, artifactCount: 0, generationMode: "fixture", ingestionMode: "demo" });
    expect(detail.artifacts).toEqual([]);
    expect(detail.events.map((e: { stage: string }) => e.stage)).toEqual(["intake"]);
    expect(db.prepare("SELECT status, attempts FROM jobs").all()).toEqual([{ status: "queued", attempts: 0 }]);
    // The snapshot (attachment bytes + mode) is stored at ingestion, not read later from the environment.
    expect(count(db, "SELECT COUNT(*) n FROM task_attachments")).toBe(detail.email.attachments.length);
  });
});

describe("batch 2: review survives API restart; responses stay clean", () => {
  it("approve persists across a full API restart, and the session cookie survives it too", async () => {
    const config = makeTestConfig();
    const first = makeTestDb(config);
    const { runToReady } = await import("@afterhours/data/testing");
    const { taskId } = runToReady(first.db, config, "persist", new Date());
    const a = await boot(config, first.db);
    const cookie = await login(a);
    const ok = await a.inject({ method: "POST", url: `/v1/tasks/${taskId}/review`, headers: { cookie, origin: ORIGIN }, payload: { revision: 1, action: "approve" } });
    expect(ok.json().data.status).toBe("approved");
    await a.close(); app = undefined; first.db.close();

    const db2 = openDb(config.databasePath);
    const b = await boot(config, db2);
    const detail = (await b.inject({ method: "GET", url: `/v1/tasks/${taskId}`, headers: { cookie } })).json().data;
    expect(detail.task.status).toBe("approved");
    expect(detail.events.some((e: { type: string; stage: string }) => e.type === "review" && e.stage === "review")).toBe(true);
    // Marking reviewed contacts nobody: the only notification is the single outbox intent from the ready commit.
    expect(getTaskDetail(db2, taskId).notifications).toHaveLength(1);
    expect(detail.notifications.every((n: { channel: string; state: string }) => n.channel === "outbox" && !["accepted", "delivered"].includes(n.state))).toBe(true);
  });

  it("task, list, notification, and download-metadata responses contain no storage paths or secrets", async () => {
    const config = makeTestConfig();
    const { db } = makeTestDb(config);
    const { runToReady } = await import("@afterhours/data/testing");
    const { taskId } = runToReady(db, config, "leak", new Date());
    const a = await boot(config, db);
    const cookie = await login(a);
    const bodies = await Promise.all(
      [`/v1/tasks/${taskId}`, "/v1/tasks", "/v1/notifications", "/v1/integrations", "/v1/settings"].map(async (url) => (await a.inject({ method: "GET", url, headers: { cookie } })).body),
    );
    const all = bodies.join("\n");
    for (const forbidden of [config.repoRoot, config.artifactsDir, config.databasePath, "rel_path", "relPath", "correct-horse-battery", "cli-token-for-tests", config.sessionSecret, "credentials"]) {
      expect(all, `leaked ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("the CLI bearer cannot download artifacts or read task detail", async () => {
    const config = makeTestConfig();
    const { db } = makeTestDb(config);
    const { runToReady } = await import("@afterhours/data/testing");
    const { taskId } = runToReady(db, config, "bearer", new Date());
    const a = await boot(config, db);
    const cookie = await login(a);
    const detail = (await a.inject({ method: "GET", url: `/v1/tasks/${taskId}`, headers: { cookie } })).json().data;
    const artifactId = detail.artifacts[0].id as string;
    expect((await a.inject({ method: "GET", url: `/v1/artifacts/${artifactId}/download`, headers: CLI })).statusCode).toBe(401);
    expect((await a.inject({ method: "GET", url: `/v1/artifacts/${artifactId}/download` })).statusCode).toBe(401);
    expect((await a.inject({ method: "GET", url: `/v1/artifacts/${artifactId}/download`, headers: { cookie } })).statusCode).toBe(200);
  });
});
