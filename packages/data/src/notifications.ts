import { DateTime } from "luxon";
import type { NotificationRecord, WorkspaceSettings } from "@afterhours/contracts";
import type { AppConfig } from "./config";
import type { Db } from "./db";
import { badRequest } from "./errors";
import { addEvent } from "./events";
import { getSettings } from "./settings";
import { addSeconds, iso, newId, parseJson } from "./util";

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function inQuietHours(q: WorkspaceSettings["notifications"]["quietHours"], now: Date): boolean {
  if (!q.enabled) return false;
  const local = DateTime.fromJSDate(now).setZone(q.timezone);
  const m = local.hour * 60 + local.minute;
  const s = toMinutes(q.start);
  const e = toMinutes(q.end);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** Next local occurrence of HH:mm strictly after `after`, in `zone`. DST gaps shift forward (Luxon). */
function nextLocal(after: DateTime, hhmm: string): DateTime {
  const [h, m] = hhmm.split(":").map(Number);
  let c = after.set({ hour: h ?? 0, minute: m ?? 0, second: 0, millisecond: 0 });
  if (c <= after) c = after.plus({ days: 1 }).set({ hour: h ?? 0, minute: m ?? 0, second: 0, millisecond: 0 });
  return c;
}

export interface Schedule {
  immediate: boolean;
  scheduledFor: Date;
  localDate: string | null;
  timezone: string;
}

/** Decide when a ready notification may be delivered. Generation is never delayed. */
export function scheduleNotification(settings: WorkspaceSettings, now: Date): Schedule {
  const q = settings.notifications.quietHours;
  if (!inQuietHours(q, now)) {
    return { immediate: true, scheduledFor: now, localDate: null, timezone: q.timezone };
  }
  const local = DateTime.fromJSDate(now).setZone(q.timezone);
  const digest = nextLocal(local, settings.notifications.digestTime);
  const quietEnd = nextLocal(local, q.end);
  const target = digest < quietEnd ? quietEnd : digest;
  return {
    immediate: false,
    scheduledFor: target.toUTC().toJSDate(),
    localDate: target.toISODate(),
    timezone: q.timezone,
  };
}

/**
 * Operator-side policy for a live WhatsApp send, computed from server configuration only (never from a
 * browser assertion). Returns the reason a send must be blocked, or null when the adapter may be called.
 * Live sends go only to the operator-designated test recipient (TWILIO_WHATSAPP_TO).
 */
export function whatsappPolicyProblem(
  config: AppConfig, settings: WorkspaceSettings, now: Date,
): string | null {
  const w = config.whatsapp;
  if (!w.twilioAccountSid || !w.twilioAuthToken || !w.from) return "WhatsApp is not configured on the server (Twilio credentials and sender are missing).";
  if (!w.useCaseEligible) return "The operator has not confirmed that this use case is eligible for WhatsApp (WHATSAPP_USE_CASE_ELIGIBLE=false).";
  if (!w.to) return "No operator-designated WhatsApp test recipient is configured (TWILIO_WHATSAPP_TO).";
  const recipient = settings.notifications.recipient ?? w.to;
  if (recipient !== w.to) return "The recipient in Settings is not the operator-designated test recipient; live sends are refused.";
  const windowOpen = !!w.customerServiceWindowUntil && Date.parse(w.customerServiceWindowUntil) > now.getTime();
  if (!windowOpen && !w.contentSid) return "The customer-service window is closed and no approved template (TWILIO_CONTENT_SID) is configured.";
  return null;
}

interface NotifRow {
  id: string; dedupe_key: string; task_id: string | null; revision: number | null;
  channel: "outbox" | "whatsapp"; state: NotificationRecord["state"]; message: string;
  task_ids_json: string; task_revisions_json: string; scheduled_for: string;
  provider_message_id: string | null; last_error: string | null; created_at: string;
  attempts: number; lease_until: string | null; lease_owner: string | null;
}

export const rowToNotification = (r: NotifRow): NotificationRecord => ({
  id: r.id,
  taskId: r.task_id,
  revision: r.revision,
  channel: r.channel,
  state: r.state,
  message: r.message,
  taskIds: parseJson<string[]>(r.task_ids_json, []),
  scheduledFor: r.scheduled_for,
  providerMessageId: r.provider_message_id,
  lastError: r.last_error,
  createdAt: r.created_at,
});

/**
 * Create the (unique) notification intent for a ready task revision. Runs inside the
 * ready-commit transaction. Immediate key: taskId/revision/channel. Quiet hours join a
 * local-date digest keyed digest/<localDate>/<channel>.
 */
export function createReadyNotification(db: Db, taskId: string, revision: number, now: Date): void {
  const settings = getSettings(db);
  const channel = settings.notifications.channel;
  const sched = scheduleNotification(settings, now);
  const t = iso(now);

  if (sched.immediate) {
    const key = `${taskId}/${revision}/${channel}`;
    const r = db.prepare(
      `INSERT OR IGNORE INTO notifications (id, dedupe_key, task_id, revision, channel, state, message,
         task_ids_json, task_revisions_json, scheduled_for, timezone, created_at, updated_at)
       VALUES (?,?,?,?,?,'queued',?,?,?,?,?,?,?)`,
    ).run(newId(), key, taskId, revision, channel, "Queued: results ready for review.",
      JSON.stringify([taskId]), JSON.stringify([revision]), iso(sched.scheduledFor), sched.timezone, t, t);
    if (r.changes > 0) addEvent(db, taskId, revision, "progress", "notify", "Notification queued.", now);
    return;
  }

  const key = `digest/${sched.localDate}/${channel}`;
  const existing = db.prepare("SELECT * FROM notifications WHERE dedupe_key = ?").get(key) as NotifRow | undefined;
  if (existing && existing.state === "queued") {
    const ids = parseJson<string[]>(existing.task_ids_json, []);
    const revs = parseJson<number[]>(existing.task_revisions_json, []);
    if (!ids.some((id, i) => id === taskId && revs[i] === revision)) {
      ids.push(taskId); revs.push(revision);
      db.prepare("UPDATE notifications SET task_ids_json=?, task_revisions_json=?, updated_at=? WHERE id=?").run(
        JSON.stringify(ids), JSON.stringify(revs), t, existing.id);
    }
  } else if (!existing) {
    db.prepare(
      `INSERT INTO notifications (id, dedupe_key, task_id, revision, channel, state, message,
         task_ids_json, task_revisions_json, scheduled_for, local_date, timezone, created_at, updated_at)
       VALUES (?,?,NULL,NULL,?,'queued',?,?,?,?,?,?,?,?)`,
    ).run(newId(), key, channel, "Queued: morning digest.", JSON.stringify([taskId]), JSON.stringify([revision]),
      iso(sched.scheduledFor), sched.localDate, sched.timezone, t, t);
  } else {
    // Digest for this date already left the queue; fall back to an immediate keyed intent.
    db.prepare(
      `INSERT OR IGNORE INTO notifications (id, dedupe_key, task_id, revision, channel, state, message,
         task_ids_json, task_revisions_json, scheduled_for, timezone, created_at, updated_at)
       VALUES (?,?,?,?,?,'queued',?,?,?,?,?,?,?)`,
    ).run(newId(), `${taskId}/${revision}/${channel}`, taskId, revision, channel, "Queued: results ready for review.",
      JSON.stringify([taskId]), JSON.stringify([revision]), t, sched.timezone, t, t);
  }
  addEvent(db, taskId, revision, "progress", "notify",
    `Quiet hours: notification scheduled for ${sched.localDate} (${sched.timezone}).`, now);
}

export const NOTIFY_LEASE_SECONDS = 60;
export const NOTIFY_MAX_ATTEMPTS = 3;

export interface ClaimedNotification {
  id: string;
  channel: "outbox" | "whatsapp";
  tasks: Array<{ id: string; title: string; revision: number; artifactCount: number }>;
  ownerToken: string;
  attempts: number;
}

export function claimDueNotification(db: Db, workerId: string, now: Date): ClaimedNotification | null {
  return db.transaction((): ClaimedNotification | null => {
    const r = db.prepare(
      `SELECT * FROM notifications WHERE state='queued' AND scheduled_for <= ?
         AND (lease_until IS NULL OR lease_until <= ?) ORDER BY scheduled_for, created_at LIMIT 1`,
    ).get(iso(now), iso(now)) as NotifRow | undefined;
    if (!r) return null;
    const owner = `${workerId}:${newId()}`;
    db.prepare("UPDATE notifications SET lease_owner=?, lease_until=?, attempts=attempts+1, updated_at=? WHERE id=?").run(
      owner, iso(addSeconds(now, NOTIFY_LEASE_SECONDS)), iso(now), r.id);
    const ids = parseJson<string[]>(r.task_ids_json, []);
    const revs = parseJson<number[]>(r.task_revisions_json, []);
    const tasks = ids.map((id, i) => {
      const t = db.prepare("SELECT title FROM tasks WHERE id=?").get(id) as { title: string } | undefined;
      const rev = revs[i] ?? 1;
      const c = db.prepare("SELECT COUNT(*) n FROM artifacts WHERE task_id=? AND revision=?").get(id, rev) as { n: number };
      return { id, title: t?.title ?? "(unknown task)", revision: rev, artifactCount: c.n };
    });
    return { id: r.id, channel: r.channel, tasks, ownerToken: owner, attempts: r.attempts + 1 };
  }).immediate();
}

export function completeNotification(
  db: Db,
  id: string,
  ownerToken: string,
  result: { state: "simulated" | "accepted" | "blocked"; message: string; providerMessageId: string | null; reason: string | null },
  now: Date,
): boolean {
  return db.transaction(() => {
    const r = db.prepare(
      `UPDATE notifications SET state=?, message=?, provider_message_id=?, last_error=?,
         lease_owner=NULL, lease_until=NULL, updated_at=? WHERE id=? AND lease_owner=? AND state='queued'`,
    ).run(result.state, result.message.slice(0, 2000), result.providerMessageId,
      result.state === "blocked" ? (result.reason ?? "Blocked by delivery policy.") : null, iso(now), id, ownerToken);
    if (r.changes === 0) return false;
    const row = db.prepare("SELECT * FROM notifications WHERE id=?").get(id) as NotifRow;
    const ids = parseJson<string[]>(row.task_ids_json, []);
    const revs = parseJson<number[]>(row.task_revisions_json, []);
    ids.forEach((tid, i) =>
      addEvent(db, tid, revs[i] ?? 1, "progress", "notify", `Notification ${result.state} (${row.channel}).`, now));
    return true;
  }).immediate();
}

/** Retryable provider errors back off; everything else (including DELIVERY_UNCERTAIN) is terminal. */
export function failNotification(
  db: Db,
  id: string,
  ownerToken: string,
  error: { message: string; retryable: boolean },
  now: Date,
): "retry" | "failed" | "lost" {
  return db.transaction((): "retry" | "failed" | "lost" => {
    const row = db.prepare("SELECT * FROM notifications WHERE id=? AND lease_owner=? AND state='queued'").get(id, ownerToken) as NotifRow | undefined;
    if (!row) return "lost";
    const msg = error.message.slice(0, 500);
    if (error.retryable && row.attempts < NOTIFY_MAX_ATTEMPTS) {
      db.prepare("UPDATE notifications SET lease_owner=NULL, lease_until=NULL, last_error=?, scheduled_for=?, updated_at=? WHERE id=?").run(
        msg, iso(addSeconds(now, 60 * row.attempts)), iso(now), id);
      return "retry";
    }
    db.prepare("UPDATE notifications SET state='failed', lease_owner=NULL, lease_until=NULL, last_error=?, updated_at=? WHERE id=?").run(msg, iso(now), id);
    const ids = parseJson<string[]>(row.task_ids_json, []);
    const revs = parseJson<number[]>(row.task_revisions_json, []);
    ids.forEach((tid, i) => addEvent(db, tid, revs[i] ?? 1, "warning", "notify", `Notification failed: ${msg}`, now));
    return "failed";
  }).immediate();
}

/**
 * A worker died mid-send. Outbox sends are safe to repeat; a live provider send may already
 * have been accepted, so it is recorded as failed/uncertain instead of resent.
 */
export function recoverNotificationLeases(db: Db, now: Date): number {
  const rows = db.prepare(
    "SELECT * FROM notifications WHERE state='queued' AND lease_until IS NOT NULL AND lease_until <= ?",
  ).all(iso(now)) as NotifRow[];
  for (const r of rows) {
    if (r.channel === "whatsapp") {
      db.prepare(
        "UPDATE notifications SET state='failed', lease_owner=NULL, lease_until=NULL, last_error=?, updated_at=? WHERE id=?",
      ).run("Delivery status is uncertain: the worker stopped during sending. It was not resent automatically.", iso(now), r.id);
    } else {
      db.prepare("UPDATE notifications SET lease_owner=NULL, lease_until=NULL, updated_at=? WHERE id=?").run(iso(now), r.id);
    }
  }
  return rows.length;
}

export function listNotifications(db: Db, cursor: string | null, limit: number): { items: NotificationRecord[]; nextCursor: string | null } {
  const c = cursor ? decodeCursor(cursor) : null;
  if (cursor && !c) throw badRequest("Invalid cursor.");
  const rows = (c
    ? db.prepare(
        `SELECT * FROM notifications WHERE (created_at < ? OR (created_at = ? AND id < ?))
         ORDER BY created_at DESC, id DESC LIMIT ?`).all(c.c, c.c, c.i, limit + 1)
    : db.prepare("SELECT * FROM notifications ORDER BY created_at DESC, id DESC LIMIT ?").all(limit + 1)) as NotifRow[];
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(rowToNotification),
    nextCursor: rows.length > limit && last ? encodeCursor(last.created_at, last.id) : null,
  };
}

export const encodeCursor = (c: string, i: string): string => Buffer.from(JSON.stringify({ c, i })).toString("base64url");
export function decodeCursor(s: string): { c: string; i: string } | null {
  try {
    const v = JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as { c?: unknown; i?: unknown };
    return typeof v.c === "string" && typeof v.i === "string" ? { c: v.c, i: v.i } : null;
  } catch {
    return null;
  }
}
