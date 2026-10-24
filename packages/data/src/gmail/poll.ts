import type { EmailEnvelope } from "@afterhours/contracts";
import type { AppConfig } from "../config";
import type { Db } from "../db";
import { ingestMessage, LIMITS, type IngestAttachment } from "../ingest";
import {
  getGmailCheckpoint, getGmailRow, getGmailTokens, recordGmailPoll, updateGmailTokens,
  type GmailCheckpoint, type GmailTokens,
} from "../integrations";
import { getSettings, normalizeEmail } from "../settings";
import type { GmailApi, GmailMessage } from "./api";
import { headerValue, parseAddress, parseAddressList, parseGmailPayload } from "./mime";

export const POLL_OVERLAP_SECONDS = 120;
const PAGE_SIZE = 50;
const MAX_PAGES = 5;
const MAX_MESSAGES_PER_CYCLE = 10;
const HANDLED_KEEP = 300;

export interface PollDeps {
  db: Db;
  config: AppConfig;
  now: () => Date;
  /** Build a Gmail client from stored credentials; must call onTokens when tokens refresh. */
  makeApi: (tokens: GmailTokens, onTokens: (t: GmailTokens) => void) => GmailApi;
}

export interface PollResult {
  status: "disconnected" | "disabled" | "ok" | "error";
  ingested: number;
  ignored: number;
  /** True when the listing hit the page cap; surfaced in logs only. */
  truncated?: boolean;
  error?: string;
}

const AUTH_RE = /invalid_grant|invalid_client|unauthorized|401|403|insufficient|token has been (expired|revoked)/i;

export function describeGmailError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (AUTH_RE.test(msg)) {
    return "Gmail rejected the saved credentials (revoked, expired test token, or missing consent). Reconnect Gmail in Settings.";
  }
  if (/429|quota|rate/i.test(msg)) return "Gmail quota or rate limit reached. Polling will retry automatically.";
  return "Gmail polling failed. It will retry automatically.";
}

/** One bounded poll cycle. Safe to call repeatedly; dedupes by checkpoint overlap + DB uniqueness. */
export async function pollGmailOnce(deps: PollDeps): Promise<PollResult> {
  const { db, config } = deps;
  const row = getGmailRow(db);
  if (!row || row.state === "disconnected" || !row.credentials_enc) return { status: "disconnected", ingested: 0, ignored: 0 };
  if (!getSettings(db).automationEnabled) return { status: "disabled", ingested: 0, ignored: 0 };

  let ingested = 0;
  let ignored = 0;
  try {
    const tokens = getGmailTokens(db, config.tokenEncryptionKey);
    if (!tokens) return { status: "disconnected", ingested, ignored };
    const api = deps.makeApi(tokens, (t) => updateGmailTokens(db, config.tokenEncryptionKey, t, deps.now()));
    const cp = getGmailCheckpoint(db);
    const connectedMs = row.connected_at ? Date.parse(row.connected_at) : cp.afterMs;
    const floorMs = Math.max(cp.afterMs, connectedMs) - POLL_OVERLAP_SECONDS * 1000;
    const query = `in:inbox after:${Math.max(0, Math.floor(floorMs / 1000))}`;

    const ids: string[] = [];
    let token: string | undefined;
    let truncated = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await api.listInbox(query, token, PAGE_SIZE);
      ids.push(...r.ids);
      if (!r.nextPageToken) break;
      token = r.nextPageToken;
      if (page === MAX_PAGES - 1) truncated = true;
    }

    const handled = new Set(cp.handled);
    // List is newest-first; take the oldest unhandled so the checkpoint can only move forward safely.
    const todo = ids.filter((id) => !handled.has(id)).reverse().slice(0, MAX_MESSAGES_PER_CYCLE);
    const fetched: GmailMessage[] = [];
    for (const id of todo) fetched.push(await api.getMessage(id));
    fetched.sort((a, b) => Number(a.internalDate) - Number(b.internalDate));

    const settings = getSettings(db);
    const allowed = new Set(settings.allowedSenders.map(normalizeEmail));
    let afterMs = cp.afterMs;
    const newHandled = [...cp.handled];

    for (const msg of fetched) {
      const internalMs = Number(msg.internalDate);
      if (internalMs < connectedMs - POLL_OVERLAP_SECONDS * 1000) {
        newHandled.push(msg.id);
        continue;
      }
      const outcome = await ingestFromGmail(deps, api, row.id, msg, allowed);
      if (outcome === "task") ingested++;
      else ignored++;
      newHandled.push(msg.id);
      afterMs = Math.max(afterMs, internalMs);
    }

    const checkpoint: GmailCheckpoint = { afterMs, handled: newHandled.slice(-HANDLED_KEEP) };
    recordGmailPoll(db, deps.now(), { checkpoint });
    return { status: "ok", ingested, ignored, truncated };
  } catch (e) {
    const message = describeGmailError(e);
    recordGmailPoll(db, deps.now(), { error: message });
    return { status: "error", ingested, ignored, error: message };
  }
}

async function ingestFromGmail(
  deps: PollDeps, api: GmailApi, integrationId: string, msg: GmailMessage, allowed: Set<string>,
): Promise<"task" | "ignored"> {
  const { db, config } = deps;
  const parsed = parseGmailPayload(msg.payload);
  const from = parseAddress(headerValue(msg.payload, "from"));
  const sender = from ? normalizeEmail(from.email) : "";

  // Unknown senders: no attachment download, no model call. ingestMessage records the bounded audit.
  const senderAllowed = !!sender && allowed.has(sender);
  const attachments: IngestAttachment[] = [];
  let total = 0;
  if (senderAllowed) {
    for (const a of parsed.attachments.slice(0, LIMITS.maxFiles)) {
      if (a.sizeBytes > LIMITS.maxFileBytes || total + a.sizeBytes > LIMITS.maxTotalBytes) continue;
      const bytes = a.inlineData ?? (a.attachmentId ? await api.getAttachment(msg.id, a.attachmentId) : null);
      if (!bytes) continue;
      if (bytes.byteLength > LIMITS.maxFileBytes) continue;
      total += bytes.byteLength;
      attachments.push({ id: a.id, filename: a.filename, mimeType: a.mimeType, bytes: new Uint8Array(bytes) });
    }
  }

  const envelope: EmailEnvelope = {
    providerMessageId: msg.id,
    providerThreadId: msg.threadId,
    from: { name: from?.name ?? null, email: sender || "unknown@invalid" },
    to: parseAddressList(headerValue(msg.payload, "to")),
    subject: headerValue(msg.payload, "subject") ?? "(no subject)",
    receivedAt: new Date(Number(msg.internalDate)).toISOString(),
    bodyText: parsed.text,
    // Full attachment list. Any part missing from task_attachments (too large / over the cap)
    // makes the worker fail the task with a clear message instead of a silent partial result.
    attachments: parsed.attachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
  };
  const out = ingestMessage(db, {
    sourceKey: `gmail:${integrationId}:${msg.id}`,
    mode: "gmail",
    integrationId,
    envelope,
    attachments,
    generationMode: config.generationMode,
    fixtureScenario: null,
  }, deps.now());
  return out.kind === "task" ? "task" : "ignored";
}
