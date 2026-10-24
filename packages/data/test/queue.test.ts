import { describe, expect, it } from "vitest";
import {
  DomainError, LeaseLostError, appendProgress, claimNextJob, commitEngineResult, getTaskDetail, getTaskSummary,
  ingestMessage, markReviewed, openDb, publishArtifactFiles, recordExecutionFailure, recoverExpiredJobs,
  retryFailedTask, submitAnswers, type Db, type AppConfig,
} from "../src";
import { injectTask, makeTestDb, officeBytes, readyResult, runToReady, testPlan, testSources } from "../src/testing";

const T = (s: number) => new Date(Date.UTC(2026, 2, 1, 10, 0, s));
const count = (db: Db, sql: string, ...a: unknown[]) => (db.prepare(sql).get(...a) as { n: number }).n;
const expectDomain = (fn: () => unknown, status: number, code?: string) => {
  try { fn(); } catch (e) {
    expect(e).toBeInstanceOf(DomainError);
    expect((e as DomainError).httpStatus).toBe(status);
    if (code) expect((e as DomainError).code).toBe(code);
    return;
  }
  throw new Error("expected DomainError");
};

describe("ingestion", () => {
  it("dedupes repeated delivery of the same source message, across connections", () => {
    const { db, config } = makeTestDb();
    const a = injectTask(db, config, "same", T(0));
    const second = ingestMessage(db, {
      sourceKey: "demo:proposal:same", mode: "demo", integrationId: null, generationMode: "fixture", fixtureScenario: "proposal",
      envelope: JSON.parse(JSON.stringify(getTaskDetail(db, a).email)), attachments: [],
    }, T(1));
    expect(second).toEqual({ kind: "task", taskId: a, deduplicated: true });
    // A second connection (as another process would hold) also dedupes via the unique key.
    const db2 = openDb(config.databasePath);
    const third = ingestMessage(db2, {
      sourceKey: "demo:proposal:same", mode: "demo", integrationId: null, generationMode: "fixture", fixtureScenario: "proposal",
      envelope: getTaskDetail(db, a).email, attachments: [],
    }, T(2));
    expect(third).toMatchObject({ kind: "task", taskId: a, deduplicated: true });
    expect(count(db, "SELECT COUNT(*) n FROM tasks")).toBe(1);
    expect(count(db, "SELECT COUNT(*) n FROM jobs")).toBe(1);
    db2.close();
  });

  it("does not start work for unknown gmail senders and keeps a bounded audit trail", () => {
    const { db } = makeTestDb();
    const envelope = {
      providerMessageId: "g1", providerThreadId: null, from: { name: null, email: "stranger@evil.test" }, to: [],
      subject: "hi", receivedAt: T(0).toISOString(), bodyText: "do things", attachments: [],
    };
    const r = ingestMessage(db, { sourceKey: "gmail:i:g1", mode: "gmail", integrationId: null, envelope, attachments: [], generationMode: "fixture", fixtureScenario: null }, T(0));
    expect(r).toEqual({ kind: "ignored", reason: "sender_not_allowed" });
    expect(count(db, "SELECT COUNT(*) n FROM tasks")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM jobs")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM intake_audit")).toBe(1);
  });

  it("does not let a demo namespace authorize a real sender", () => {
    const { db } = makeTestDb();
    const envelope = {
      providerMessageId: "d1", providerThreadId: null, from: { name: null, email: "boss@company.com" }, to: [],
      subject: "hi", receivedAt: T(0).toISOString(), bodyText: "x", attachments: [],
    };
    const r = ingestMessage(db, { sourceKey: "demo:x", mode: "demo", integrationId: null, envelope, attachments: [], generationMode: "fixture", fixtureScenario: "proposal" }, T(0));
    expect(r.kind).toBe("ignored");
  });
});

describe("queue claiming and leases", () => {
  it("only one of two competing workers receives the lease", () => {
    const { db, config } = makeTestDb();
    injectTask(db, config, "k", T(0));
    const db2 = openDb(config.databasePath);
    const a = claimNextJob(db, "w1", T(1));
    const b = claimNextJob(db2, "w2", T(1));
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(getTaskSummary(db, a!.taskId).status).toBe("planning");
    db2.close();
  });

  it("recovers an expired lease once, rejects the stale owner, and gives up after the attempt limit", () => {
    const { db, config } = makeTestDb();
    const taskId = injectTask(db, config, "k", T(0));
    const first = claimNextJob(db, "w1", T(0))!;
    expect(recoverExpiredJobs(db, T(30))).toBe(0); // lease still valid
    expect(recoverExpiredJobs(db, T(100))).toBe(1);
    expect(getTaskSummary(db, taskId).status).toBe("queued");
    const second = claimNextJob(db, "w2", T(101))!;
    expect(second.attempts).toBe(2);

    // Stale owner must not be able to commit or write progress.
    const result = readyResult({ taskId, revision: 1 });
    expect(() => commitEngineResult(db, {
      taskId, revision: 1, ownerToken: first.ownerToken, now: T(102), outcome: "ready",
      plan: result.plan, sources: result.sources, products: result.products, warnings: [], files: [],
    })).toThrow(LeaseLostError);
    expect(appendProgress(db, { taskId, revision: 1, ownerToken: first.ownerToken }, { stage: "plan", message: "late" }, T(102))).toBe(false);

    // Second lease also expires -> attempts exhausted -> task failed (user may manually retry).
    expect(recoverExpiredJobs(db, T(300))).toBe(1);
    const s = getTaskSummary(db, taskId);
    expect(s.status).toBe("failed");
    expect(s.error).toMatchObject({ code: "LEASE_EXPIRED", retryable: true });
  });

  it("retries a transient failure once after the delay, then fails terminally", () => {
    const { db, config } = makeTestDb();
    const taskId = injectTask(db, config, "k", T(0));
    const c1 = claimNextJob(db, "w", T(0))!;
    const ref = (c: typeof c1) => ({ taskId, revision: 1, ownerToken: c.ownerToken });
    const out1 = recordExecutionFailure(db, ref(c1), { code: "TIMEOUT", message: "Provider timed out.", retryable: true }, T(5));
    expect(out1).toEqual({ lost: false, willRetry: true });
    expect(getTaskSummary(db, taskId).status).toBe("queued");
    expect(getTaskSummary(db, taskId).error).toBeNull();
    expect(claimNextJob(db, "w", T(20))).toBeNull(); // before available_at (+30s)
    const c2 = claimNextJob(db, "w", T(40))!;
    expect(c2.attempts).toBe(2);
    const out2 = recordExecutionFailure(db, ref(c2), { code: "TIMEOUT", message: "Provider timed out.", retryable: true }, T(45));
    expect(out2).toEqual({ lost: false, willRetry: false });
    expect(getTaskSummary(db, taskId)).toMatchObject({ status: "failed", error: { code: "TIMEOUT", retryable: true } });
  });

  it("fails immediately and permanently on a non-retryable error", () => {
    const { db, config } = makeTestDb();
    const taskId = injectTask(db, config, "k", T(0));
    const c = claimNextJob(db, "w", T(0))!;
    const out = recordExecutionFailure(db, { taskId, revision: 1, ownerToken: c.ownerToken }, { code: "MODEL_NOT_CONFIGURED", message: "No key.", retryable: false }, T(1));
    expect(out).toEqual({ lost: false, willRetry: false });
    expect(getTaskSummary(db, taskId).status).toBe("failed");
    expect(claimNextJob(db, "w", T(500))).toBeNull();
  });
});

describe("engine result commit", () => {
  it("publishes manifest, status, and exactly one notification intent for a ready result", () => {
    const { db, config } = makeTestDb();
    const { taskId } = runToReady(db, config, "k", T(0));
    const d = getTaskDetail(db, taskId);
    expect(d.task.status).toBe("ready");
    expect(d.artifacts.map((a) => a.format).sort()).toEqual(["docx", "pptx"]);
    expect(d.artifacts[0]!.downloadPath).toMatch(/^\/api\/artifacts\/.+\/download$/);
    expect(d.products).toHaveLength(2);
    expect(d.notifications).toHaveLength(1);
    expect(d.notifications[0]!.state).toBe("queued");
    expect(count(db, "SELECT COUNT(*) n FROM jobs WHERE status='done'")).toBe(1);
    expect(JSON.stringify(d)).not.toMatch(/\/var\/|afterhours-test/); // no absolute paths in DTOs
  });

  it("does not publish a manifest when the artifact set is incomplete or invalid", () => {
    const { db, config } = makeTestDb();
    const taskId = injectTask(db, config, "k", T(0));
    claimNextJob(db, "w", T(0));
    const r = readyResult({ taskId, revision: 1 });
    r.files[1] = { ...r.files[1]!, bytes: new TextEncoder().encode("not an office file ".repeat(10)) };
    expect(() => publishArtifactFiles(config.artifactsDir, taskId, 1, r.files)).toThrow(/ZIP/);
    expect(count(db, "SELECT COUNT(*) n FROM artifacts")).toBe(0);
    expect(getTaskSummary(db, taskId).status).toBe("planning");
  });

  it("rejects a second commit for the same job (no duplicate ready manifests)", () => {
    const { db, config } = makeTestDb();
    const { taskId, claimed } = runToReady(db, config, "k", T(0));
    const r = readyResult({ taskId, revision: 1 });
    expect(() => commitEngineResult(db, {
      taskId, revision: 1, ownerToken: claimed.ownerToken, now: T(5), outcome: "ready",
      plan: r.plan, sources: r.sources, products: r.products, warnings: [], files: [],
    })).toThrow(LeaseLostError);
    expect(count(db, "SELECT COUNT(*) n FROM artifacts")).toBe(2);
    expect(count(db, "SELECT COUNT(*) n FROM notifications")).toBe(1);
  });

  it("skips and needs_input create no files or notifications", () => {
    const { db, config } = makeTestDb();
    const t1 = injectTask(db, config, "a", T(0), "no_action");
    const c1 = claimNextJob(db, "w", T(0))!;
    commitEngineResult(db, { taskId: t1, revision: 1, ownerToken: c1.ownerToken, now: T(1), outcome: "skipped", reason: "No request found.", sources: testSources() });
    expect(getTaskSummary(db, t1).status).toBe("skipped");
    const t2 = injectTask(db, config, "b", T(2), "ambiguous");
    const c2 = claimNextJob(db, "w", T(2))!;
    commitEngineResult(db, {
      taskId: t2, revision: 1, ownerToken: c2.ownerToken, now: T(3), outcome: "needs_input", plan: testPlan(), sources: testSources(),
      questions: [{ id: "q1", question: "Scope?", reason: "No scope given", required: true }], warnings: [],
    });
    expect(getTaskSummary(db, t2).status).toBe("needs_input");
    expect(count(db, "SELECT COUNT(*) n FROM artifacts")).toBe(0);
    expect(count(db, "SELECT COUNT(*) n FROM notifications")).toBe(0);
  });
});

describe("review, answers, and retry", () => {
  it("marks reviewed only from ready; stale revision is 409; reviewed state is terminal", () => {
    const { db, config } = makeTestDb();
    const { taskId } = runToReady(db, config, "k", T(0));
    expectDomain(() => markReviewed(db, taskId, 2, "approve", T(1)), 409, "STALE_REVISION");
    expect(markReviewed(db, taskId, 1, "approve", T(2)).status).toBe("approved");
    expectDomain(() => markReviewed(db, taskId, 1, "approve", T(3)), 409, "INVALID_TRANSITION");
    expectDomain(() => markReviewed(db, taskId, 1, "dismiss", T(3)), 409, "INVALID_TRANSITION");
    const events = getTaskDetail(db, taskId).events;
    expect(events.at(-1)).toMatchObject({ type: "review", message: "Marked reviewed. Nothing was sent." });
  });

  it("cannot approve failed or needs_input work, but can dismiss it", () => {
    const { db, config } = makeTestDb();
    const t = injectTask(db, config, "k", T(0));
    const c = claimNextJob(db, "w", T(0))!;
    recordExecutionFailure(db, { taskId: t, revision: 1, ownerToken: c.ownerToken }, { code: "X", message: "bad", retryable: false }, T(1));
    expectDomain(() => markReviewed(db, t, 1, "approve", T(2)), 409);
    expect(markReviewed(db, t, 1, "dismiss", T(2)).status).toBe("dismissed");
  });

  it("validates answers, bumps revision, queues a job atomically, and keeps old answers traceable", () => {
    const { db, config } = makeTestDb();
    const t = injectTask(db, config, "k", T(0), "ambiguous");
    const c = claimNextJob(db, "w", T(0))!;
    commitEngineResult(db, {
      taskId: t, revision: 1, ownerToken: c.ownerToken, now: T(1), outcome: "needs_input", plan: testPlan(), sources: testSources(),
      questions: [
        { id: "q1", question: "What is the scope?", reason: "r", required: true },
        { id: "q2", question: "Preferred tone?", reason: "r", required: false },
      ], warnings: [],
    });
    expectDomain(() => submitAnswers(db, t, 1, [{ questionId: "nope", answer: "x" }], T(2)), 400);
    expectDomain(() => submitAnswers(db, t, 1, [{ questionId: "q1", answer: "a" }, { questionId: "q1", answer: "b" }], T(2)), 400);
    expectDomain(() => submitAnswers(db, t, 1, [{ questionId: "q1", answer: "   " }], T(2)), 400);
    expectDomain(() => submitAnswers(db, t, 1, [{ questionId: "q2", answer: "warm" }], T(2)), 400); // required q1 missing
    expectDomain(() => submitAnswers(db, t, 9, [{ questionId: "q1", answer: "web" }], T(2)), 409, "STALE_REVISION");
    expect(count(db, "SELECT COUNT(*) n FROM jobs")).toBe(1); // failed attempts left no partial writes

    const s = submitAnswers(db, t, 1, [{ questionId: "q1", answer: "A five-page site" }, { questionId: "q2", answer: "warm" }], T(3));
    expect(s).toMatchObject({ status: "queued", revision: 2 });
    expect(count(db, "SELECT COUNT(*) n FROM jobs WHERE task_id=? AND revision=2 AND status='queued'", t)).toBe(1);
    const hist = db.prepare("SELECT question, answer, revision FROM answer_history WHERE task_id=? ORDER BY id").all(t);
    expect(hist).toEqual([
      { question: "What is the scope?", answer: "A five-page site", revision: 1 },
      { question: "Preferred tone?", answer: "warm", revision: 1 },
    ]);
    expect(getTaskDetail(db, t).answers).toHaveLength(2);
    // Revision 2 claims and runs; stale revision-1 actions now 409.
    expectDomain(() => submitAnswers(db, t, 1, [{ questionId: "q1", answer: "x" }], T(4)), 409);
  });

  it("allows manual retry only from failed, creating a new revision; earlier artifacts stay immutable", () => {
    const { db, config } = makeTestDb();
    const ready = runToReady(db, config, "r", T(0));
    expectDomain(() => retryFailedTask(db, ready.taskId, 1, T(1)), 409);

    const t = injectTask(db, config, "f", T(2));
    const c = claimNextJob(db, "w", T(2))!;
    recordExecutionFailure(db, { taskId: t, revision: 1, ownerToken: c.ownerToken }, { code: "X", message: "bad", retryable: false }, T(3));
    expectDomain(() => retryFailedTask(db, t, 5, T(4)), 409, "STALE_REVISION");
    const s = retryFailedTask(db, t, 1, T(4));
    expect(s).toMatchObject({ status: "queued", revision: 2, error: null });
    expect(getTaskDetail(db, t).events.some((e) => e.revision === 1 && e.type === "error")).toBe(true); // history kept
    const arts = count(db, "SELECT COUNT(*) n FROM artifacts WHERE task_id=?", ready.taskId);
    expect(arts).toBe(2);
  });

  it("moves planning->running only when generation starts and exposes the early plan", () => {
    const { db, config } = makeTestDb();
    const t = injectTask(db, config, "k", T(0));
    const c = claimNextJob(db, "w", T(0))!;
    const ref = { taskId: t, revision: 1, ownerToken: c.ownerToken };
    appendProgress(db, ref, { stage: "plan", message: "Planning", plan: testPlan("My plan") }, T(1));
    expect(getTaskSummary(db, t)).toMatchObject({ status: "planning", title: "My plan" });
    appendProgress(db, ref, { stage: "generate", message: "Drafting" }, T(2));
    expect(getTaskSummary(db, t).status).toBe("running");
    expect(getTaskDetail(db, t).plan?.title).toBe("My plan");
  });
});

describe("data hygiene", () => {
  it("keeps officeBytes helper valid for the validator", () => {
    const { config } = makeTestDb();
    const r = readyResult({ taskId: "abc12345", revision: 1 });
    expect(() => publishArtifactFiles(config.artifactsDir, "abc12345", 1, r.files)).not.toThrow();
    expect(officeBytes("docx")[0]).toBe(0x50);
  });
});

export type _Unused = AppConfig;
