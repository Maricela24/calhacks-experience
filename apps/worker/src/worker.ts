import {
  DeliveryResultSchema, EngineInputSchema, FixtureScenarioSchema, OrganizationProfileSchema,
  type DeliveryInput, type DeliveryResult, type EngineDependencies, type EngineInput, type EngineResult,
  type EmailEnvelope, type WorkAnswer,
} from "@afterhours/contracts";
import {
  ArtifactValidationError, EngineResultError, LIMITS, LeaseLostError, MAX_ATTEMPTS, appendProgress,
  clientWithTokens, claimDueNotification, claimNextJob, cleanStaging, commitEngineResult, completeNotification,
  createGmailApi, failNotification, getSettings, getTaskRow, parseJson, pollGmailOnce, publishArtifactFiles,
  liveModelProblem, recordExecutionFailure, recordWorkerHeartbeat, recoverExpiredJobs, recoverNotificationLeases, releaseJob,
  heartbeatJob, validateEngineResult, whatsappPolicyProblem,
  type AppConfig, type ClaimedJob, type Db, type GmailApi, type GmailTokens,
} from "@afterhours/data";
import type { Logger } from "./log";

export const JOB_DEADLINE_MS = 240_000;
export const HEARTBEAT_INTERVAL_MS = 15_000;

export interface WorkerDeps {
  db: Db;
  config: AppConfig;
  workerId: string;
  now?: () => Date;
  runWork: (input: EngineInput, deps: EngineDependencies) => Promise<EngineResult>;
  sendNotification: (input: DeliveryInput) => Promise<DeliveryResult>;
  makeGmailApi?: (tokens: GmailTokens, onTokens: (t: GmailTokens) => void) => GmailApi;
  log: Logger;
  /** Test hooks. */
  jobDeadlineMs?: number;
  heartbeatIntervalMs?: number;
}

interface SafeFailure { code: string; message: string; retryable: boolean }

/** Defense in depth: provider errors are stored and shown, so strip anything shaped like a credential. */
export function redact(message: string): string {
  return message
    .replace(/\b(sk|rk|pk)-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\bya29\.[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/\b1\/\/[A-Za-z0-9._-]{10,}/g, "[redacted]");
}

function classify(err: unknown): SafeFailure {
  const e = err as { code?: unknown; retryable?: unknown; message?: unknown; name?: unknown };
  if (err instanceof EngineResultError || err instanceof ArtifactValidationError) {
    return { code: err instanceof EngineResultError ? err.code : "ARTIFACT_INVALID", message: String((err as Error).message).slice(0, 500), retryable: false };
  }
  if (typeof e?.code === "string" && typeof e?.retryable === "boolean") {
    return { code: e.code, message: redact(String(e.message ?? "The engine reported an error.")).slice(0, 500), retryable: e.retryable };
  }
  return { code: "ENGINE_UNEXPECTED_ERROR", message: "The engine failed unexpectedly. Check worker logs for the error code.", retryable: false };
}

export function createWorker(deps: WorkerDeps) {
  const { db, config, workerId, log } = deps;
  const now = deps.now ?? (() => new Date());
  const deadlineMs = deps.jobDeadlineMs ?? JOB_DEADLINE_MS;
  const hbMs = deps.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  let stopping = false;
  let current: { promise: Promise<void>; abort: (reason: string) => void } | null = null;
  const timers: NodeJS.Timeout[] = [];

  const makeGmailApi: NonNullable<WorkerDeps["makeGmailApi"]> =
    deps.makeGmailApi ??
    ((tokens, onTokens) => createGmailApi(clientWithTokens(config, tokens, onTokens)));

  // ---------- Engine jobs ----------
  async function buildInput(claimed: ClaimedJob): Promise<EngineInput> {
    const task = getTaskRow(db, claimed.taskId);
    const intake = db.prepare("SELECT envelope_json FROM intake_messages WHERE id=?").get(task.intake_id) as { envelope_json: string };
    const email = JSON.parse(intake.envelope_json) as EmailEnvelope;
    const rows = db
      .prepare("SELECT attachment_id, filename, mime_type, size_bytes, bytes FROM task_attachments WHERE task_id=?")
      .all(task.id) as Array<{ attachment_id: string; filename: string; mime_type: string; size_bytes: number; bytes: Buffer }>;

    const have = new Set(rows.map((r) => r.attachment_id));
    const missing = email.attachments.filter((a) => !have.has(a.id));
    if (missing.length) {
      throw Object.assign(new Error(
        `Attachment "${missing[0]!.filename}" was not read: files must be at most 10 MB each, 20 MB total, and ${LIMITS.maxFiles} per email. ` +
        "Send a smaller set of files in a new email.",
      ), { code: "ATTACHMENT_UNAVAILABLE", retryable: false });
    }
    const total = rows.reduce((n, r) => n + r.size_bytes, 0);
    if (rows.length > LIMITS.maxFiles || total > LIMITS.maxTotalBytes || rows.some((r) => r.size_bytes > LIMITS.maxFileBytes)) {
      throw Object.assign(new Error("Attachments exceed the supported size limits."), { code: "ATTACHMENT_TOO_LARGE", retryable: false });
    }
    if (task.generation_mode === "live") {
      const problem = liveModelProblem(config);
      if (problem) throw Object.assign(new Error(problem.message), { code: problem.code, retryable: false });
    }
    const scenario = FixtureScenarioSchema.safeParse(task.fixture_scenario);
    return EngineInputSchema.parse({
      taskId: task.id,
      revision: task.revision,
      mode: task.generation_mode,
      email,
      attachments: rows.map((r) => ({ id: r.attachment_id, filename: r.filename, mimeType: r.mime_type, bytes: new Uint8Array(r.bytes) })),
      // Ingestion-time snapshot; settings edits after ingestion do not change this task's context.
      organization: OrganizationProfileSchema.parse(
        task.organization_json ? JSON.parse(task.organization_json) : getSettings(db).organization,
      ),
      answers: parseJson<WorkAnswer[]>(task.answers_json, []),
      now: now().toISOString(),
      fixtureScenario: scenario.success ? scenario.data : null,
    });
  }

  async function executeJob(claimed: ClaimedJob): Promise<void> {
    const ref = { taskId: claimed.taskId, revision: claimed.revision, ownerToken: claimed.ownerToken };
    const started = Date.now();
    const controller = new AbortController();
    let abortReason: "deadline" | "lease_lost" | "shutdown" | null = null;
    const abort = (r: "deadline" | "lease_lost" | "shutdown") => { abortReason ??= r; controller.abort(); };
    const deadline = setTimeout(() => abort("deadline"), deadlineMs);
    const hb = setInterval(() => {
      if (!heartbeatJob(db, claimed.jobId, claimed.ownerToken, now())) abort("lease_lost");
    }, hbMs);
    current = { promise: Promise.resolve(), abort: (r) => abort(r as "shutdown") };
    log("info", "job.start", { taskId: claimed.taskId, revision: claimed.revision, attempt: claimed.attempts });
    try {
      const input = await buildInput(claimed);
      const result = validateEngineResult(
        await deps.runWork(input, {
          signal: controller.signal,
          onProgress: async (p) => {
            if (!appendProgress(db, ref, p, now())) { abort("lease_lost"); throw new LeaseLostError(); }
          },
        }),
        input,
      );
      if (abortReason === "lease_lost") throw new LeaseLostError();
      if (result.outcome === "ready") {
        const stored = publishArtifactFiles(config.artifactsDir, claimed.taskId, claimed.revision, result.files);
        commitEngineResult(db, { ...ref, now: now(), outcome: "ready", plan: result.plan, sources: result.sources,
          products: result.products, warnings: result.warnings, files: stored });
      } else if (result.outcome === "needs_input") {
        commitEngineResult(db, { ...ref, now: now(), outcome: "needs_input", plan: result.plan, sources: result.sources,
          questions: result.questions, warnings: result.warnings });
      } else {
        commitEngineResult(db, { ...ref, now: now(), outcome: "skipped", reason: result.reason, sources: result.sources });
      }
      log("info", "job.done", { taskId: claimed.taskId, revision: claimed.revision, outcome: result.outcome, ms: Date.now() - started });
    } catch (err) {
      if (err instanceof LeaseLostError || abortReason === "lease_lost") {
        log("warn", "job.lease_lost", { taskId: claimed.taskId, revision: claimed.revision });
        return;
      }
      if (abortReason === "shutdown") {
        releaseJob(db, claimed.taskId, claimed.revision, claimed.ownerToken, now());
        log("warn", "job.released_on_shutdown", { taskId: claimed.taskId });
        return;
      }
      const failure: SafeFailure =
        abortReason === "deadline"
          ? { code: "ENGINE_TIMEOUT", message: `Generation exceeded ${Math.round(deadlineMs / 1000)} seconds.`, retryable: true }
          : classify(err);
      const out = recordExecutionFailure(db, ref, failure, now());
      log(failure.retryable ? "warn" : "error", "job.failed", {
        taskId: claimed.taskId, revision: claimed.revision, code: failure.code,
        willRetry: !out.lost && out.willRetry, maxAttempts: MAX_ATTEMPTS,
      });
    } finally {
      clearTimeout(deadline);
      clearInterval(hb);
      current = null;
    }
  }

  async function processNextJob(): Promise<boolean> {
    if (stopping) return false;
    const claimed = claimNextJob(db, workerId, now());
    if (!claimed) return false;
    const p = executeJob(claimed);
    // Track the promise so shutdown can wait for it.
    const tracked = { promise: p, abort: current?.abort ?? (() => undefined) };
    current = tracked;
    await p;
    return true;
  }

  // ---------- Notifications ----------
  async function processNextNotification(): Promise<boolean> {
    const claim = claimDueNotification(db, workerId, now());
    if (!claim) return false;
    const settings = getSettings(db);
    const until = config.whatsapp.customerServiceWindowUntil;
    if (claim.channel === "whatsapp") {
      // Operator policy is enforced here, before any provider code runs: a blocked configuration is
      // terminal (no retry loop) and the ready result stays reviewable in the dashboard.
      const problem = whatsappPolicyProblem(config, settings, now());
      if (problem) {
        completeNotification(db, claim.id, claim.ownerToken,
          { state: "blocked", message: "Not sent: live WhatsApp delivery is blocked.", providerMessageId: null, reason: problem }, now());
        log("info", "notification.done", { notificationId: claim.id, state: "blocked" });
        return true;
      }
    }
    const input: DeliveryInput = {
      notificationId: claim.id,
      channel: claim.channel,
      recipient: claim.channel === "whatsapp" ? config.whatsapp.to : (settings.notifications.recipient ?? config.whatsapp.to),
      publicAppUrl: config.publicAppUrl,
      tasks: claim.tasks,
      deliveryPolicy: {
        eligible: config.whatsapp.useCaseEligible,
        customerServiceWindowOpen: !!until && Date.parse(until) > now().getTime(),
        approvedContentSid: config.whatsapp.contentSid,
      },
    };
    try {
      const result = DeliveryResultSchema.parse(await deps.sendNotification(input));
      if (result.state === "accepted" && !result.providerMessageId) {
        // "accepted" means the provider returned a message id; without one the outcome is unknown.
        failNotification(db, claim.id, claim.ownerToken,
          { message: "DELIVERY_UNCERTAIN: the provider reported acceptance without a message id. It was not resent.", retryable: false }, now());
        log("warn", "notification.failed", { notificationId: claim.id, code: "DELIVERY_UNCERTAIN" });
        return true;
      }
      if (result.state === "simulated" && claim.channel !== "outbox") {
        failNotification(db, claim.id, claim.ownerToken,
          { message: "DELIVERY_ADAPTER_ERROR: a live channel returned a simulated result; nothing was sent.", retryable: false }, now());
        return true;
      }
      completeNotification(db, claim.id, claim.ownerToken, result, now());
      log("info", "notification.done", { notificationId: claim.id, state: result.state });
    } catch (err) {
      const e = err as { code?: unknown; retryable?: unknown; message?: unknown };
      const code = typeof e?.code === "string" ? e.code : "DELIVERY_ERROR";
      const retryable = code === "DELIVERY_UNCERTAIN" ? false : e?.retryable === true;
      const message = typeof e?.code === "string" ? `${code}: ${String(e.message ?? "Delivery failed.")}` : "Delivery failed unexpectedly.";
      const outcome = failNotification(db, claim.id, claim.ownerToken, { message, retryable }, now());
      log("warn", "notification.failed", { notificationId: claim.id, code, outcome });
    }
    return true;
  }

  async function pollInbox() {
    const res = await pollGmailOnce({ db, config, now, makeApi: makeGmailApi });
    if (res.status === "ok" && (res.ingested || res.ignored)) {
      log("info", "gmail.poll", { ingested: res.ingested, ignored: res.ignored });
    } else if (res.status === "error") {
      log("warn", "gmail.poll_error", { error: res.error });
    }
    return res;
  }

  // ---------- Lifecycle ----------
  function loop(name: string, everyMs: number, fn: () => Promise<unknown>) {
    const tick = async () => {
      if (stopping) return;
      try {
        await fn();
      } catch (e) {
        const code = (e as { code?: string })?.code ?? (e as Error)?.name ?? "unknown";
        log("error", `${name}.loop_error`, { code });
        recordWorkerHeartbeat(db, workerId, now(), `${name}: ${code}`);
      }
      if (!stopping) timers.push(setTimeout(tick, everyMs));
    };
    timers.push(setTimeout(tick, 0));
  }

  function start() {
    recordWorkerHeartbeat(db, workerId, now());
    const recovered = recoverExpiredJobs(db, now());
    recoverNotificationLeases(db, now());
    const cleaned = cleanStaging(config.artifactsDir, now().getTime());
    log("info", "worker.start", { workerId, recoveredJobs: recovered, cleanedStaging: cleaned, generationMode: config.generationMode });

    timers.push(setInterval(() => { try { recordWorkerHeartbeat(db, workerId, now()); } catch { /* db closing */ } }, 10_000));
    loop("jobs", 1000, async () => {
      recoverExpiredJobs(db, now());
      while (await processNextJob()) { /* drain */ }
    });
    loop("notifications", 5000, async () => {
      recoverNotificationLeases(db, now());
      while (await processNextNotification()) { /* drain */ }
    });
    loop("inbox", config.gmailPollIntervalSeconds * 1000, pollInbox);
  }

  async function stop(graceMs = 10_000) {
    stopping = true;
    for (const t of timers) { clearTimeout(t); clearInterval(t); }
    const job = current;
    if (job) {
      const done = await Promise.race([job.promise.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), graceMs))]);
      if (!done) {
        job.abort("shutdown");
        await job.promise.catch(() => undefined);
      }
    }
    log("info", "worker.stopped", { workerId });
  }

  return { start, stop, processNextJob, processNextNotification, pollInbox, executeJob };
}
