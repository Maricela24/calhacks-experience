import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { apiPortMismatch, getTaskDetail, injectDemo, loadDemoFixture } from "../src";
import { makeTestConfig, makeTestDb } from "../src/testing";

describe("demo injection keeps the fixture's receivedAt", () => {
  it("stores the fixture receivedAt for every injection time; ingestion time is created_at", () => {
    const config = makeTestConfig();
    const { db } = makeTestDb(config);
    const fixtureReceivedAt = loadDemoFixture(config.repoRoot, "proposal").fixture.email.receivedAt;
    const t1 = new Date("2026-10-23T08:00:00.000Z");
    const t2 = new Date("2027-02-14T21:30:00.000Z");
    const a = injectDemo(db, config, "proposal", "d1", t1);
    const b = injectDemo(db, config, "proposal", "d2", t2);
    if (a.kind !== "task" || b.kind !== "task") throw new Error("expected tasks");
    for (const [id, ingested] of [[a.taskId, t1], [b.taskId, t2]] as const) {
      const detail = getTaskDetail(db, id);
      expect(detail.email.receivedAt).toBe(fixtureReceivedAt);
      expect(detail.email.receivedAt).not.toBe(ingested.toISOString());
      expect(detail.task.createdAt).toBe(ingested.toISOString());
      const row = db.prepare("SELECT m.received_at, m.created_at FROM intake_messages m JOIN tasks t ON t.intake_id = m.id WHERE t.id = ?").get(id) as { received_at: string; created_at: string };
      expect(row).toEqual({ received_at: fixtureReceivedAt, created_at: ingested.toISOString() });
    }
  });

  it("still namespaces the provider message id by scenario and replay key", () => {
    const config = makeTestConfig();
    const { db } = makeTestDb(config);
    const out = injectDemo(db, config, "report", "k1", new Date());
    if (out.kind !== "task") throw new Error("expected task");
    expect(getTaskDetail(db, out.taskId).email.providerMessageId).toBe("demo:report:k1");
  });
});

describe("API port consistency", () => {
  it("flags a loopback origin whose port differs from API_PORT", () => {
    expect(apiPortMismatch({ apiOrigin: "http://127.0.0.1:4000", apiPort: 4000 })).toBeNull();
    expect(apiPortMismatch({ apiOrigin: "http://localhost:4177", apiPort: 4177 })).toBeNull();
    expect(apiPortMismatch({ apiOrigin: "http://127.0.0.1:4000", apiPort: 4177 })).toMatch(/API_PORT is 4177 but API_ORIGIN points at port 4000/);
  });

  it("does not check non-loopback origins such as the Compose service name", () => {
    expect(apiPortMismatch({ apiOrigin: "http://api:4000", apiPort: 4000 })).toBeNull();
    expect(apiPortMismatch({ apiOrigin: "http://api:4000", apiPort: 4177 })).toBeNull();
  });

  it("the web proxy rewrite and the config agree on API_ORIGIN", async () => {
    process.env.API_ORIGIN = "http://127.0.0.1:4177";
    const nextConfig = pathToFileURL(path.resolve(import.meta.dirname, "../../../apps/web/next.config.mjs")).href;
    const mod = (await import(/* @vite-ignore */ nextConfig)) as { default: { rewrites: () => Promise<Array<{ source: string; destination: string }>> } };
    const rules = await mod.default.rewrites();
    expect(rules).toContainEqual({ source: "/api/:path*", destination: "http://127.0.0.1:4177/v1/:path*" });
    const config = makeTestConfig({ API_ORIGIN: "http://127.0.0.1:4177", API_PORT: "4177" });
    expect(config.apiOrigin).toBe("http://127.0.0.1:4177");
    expect(config.apiPort).toBe(4177);
  });
});
