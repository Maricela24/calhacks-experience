import { DateTime } from "luxon";
import {
  OrganizationProfileSchema,
  WorkspaceSettingsSchema,
  type SettingsPatch,
  type WorkspaceSettings,
} from "@afterhours/contracts";
import type { Db } from "./db";
import { badRequest } from "./errors";
import { iso } from "./util";

export function isValidZone(zone: string): boolean {
  return DateTime.local().setZone(zone).isValid;
}

export const defaultSettings = (
  organization: WorkspaceSettings["organization"],
  channel: "outbox" | "whatsapp",
): WorkspaceSettings => ({
  organization,
  automationEnabled: true,
  allowedSenders: [],
  autoPrepare: true,
  notifications: {
    channel,
    recipient: null,
    quietHours: { enabled: false, start: "22:00", end: "07:00", timezone: organization.timezone },
    digestTime: "08:00",
  },
});

/** Insert default settings only if none exist. Idempotent. */
export function seedSettings(db: Db, defaults: WorkspaceSettings, now: Date): boolean {
  const parsed = WorkspaceSettingsSchema.parse(defaults);
  const r = db
    .prepare("INSERT OR IGNORE INTO workspace_settings (id, settings_json, updated_at) VALUES (1, ?, ?)")
    .run(JSON.stringify(parsed), iso(now));
  return r.changes > 0;
}

export function getSettings(db: Db): WorkspaceSettings {
  const row = db.prepare("SELECT settings_json FROM workspace_settings WHERE id = 1").get() as
    | { settings_json: string }
    | undefined;
  if (!row) throw new Error("Workspace settings are not seeded. Run pnpm db:seed.");
  return WorkspaceSettingsSchema.parse(JSON.parse(row.settings_json));
}

export const normalizeEmail = (e: string): string => e.trim().toLowerCase();
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const E164 = /^\+[1-9]\d{6,14}$/;
const TEXT_LIMITS = { name: 200, description: 2_000, backgroundText: 20_000, policiesText: 20_000, fontFamily: 100 } as const;

/** Field-level checks for the patched values only (seeded values are trusted as they are). */
function validatePatch(patch: SettingsPatch): void {
  const o = patch.organization;
  if (o) {
    for (const [k, max] of Object.entries(TEXT_LIMITS)) {
      const v = k === "fontFamily" ? o.brand?.fontFamily : (o as Record<string, unknown>)[k];
      if (typeof v === "string" && v.length > max) throw badRequest(`organization.${k} must be at most ${max} characters.`);
    }
    if (o.name !== undefined && !o.name.trim()) throw badRequest("organization.name must not be empty.");
    if (o.currency !== undefined && !/^[A-Z]{3}$/.test(o.currency)) throw badRequest("organization.currency must be a 3-letter ISO code such as USD.");
    for (const c of ["primaryColor", "accentColor"] as const) {
      const v = o.brand?.[c];
      if (v !== undefined && !HEX_COLOR.test(v)) throw badRequest(`organization.brand.${c} must be a #RRGGBB color.`);
    }
  }
  const r = patch.notifications?.recipient;
  if (r !== undefined && r !== null && !E164.test(r)) {
    throw badRequest("notifications.recipient must be an E.164 phone number such as +15551234567, or null.");
  }
}

/**
 * Validate and merge an editable patch. Credentials, provider settings and WhatsApp eligibility are not
 * part of the patch schema (strict), so a browser cannot set them. Organization edits apply to newly
 * ingested tasks only: each task snapshots the organization at ingestion.
 */
export function patchSettings(db: Db, patch: SettingsPatch, now: Date): WorkspaceSettings {
  validatePatch(patch);
  const cur = getSettings(db);
  const next: WorkspaceSettings = structuredClone(cur);
  if (patch.organization) {
    const { brand, ...rest } = patch.organization;
    Object.assign(next.organization, rest);
    if (brand) Object.assign(next.organization.brand, brand);
  }
  if (patch.automationEnabled !== undefined) next.automationEnabled = patch.automationEnabled;
  if (patch.autoPrepare !== undefined) next.autoPrepare = patch.autoPrepare;
  if (patch.allowedSenders) {
    const list = [...new Set(patch.allowedSenders.map(normalizeEmail))];
    const bad = list.find((e) => !EMAIL_RE.test(e) || e.includes("*"));
    if (bad) throw badRequest(`allowedSenders must be exact email addresses without wildcards: "${bad}"`);
    next.allowedSenders = list;
  }
  if (patch.notifications) {
    const { quietHours, ...rest } = patch.notifications;
    Object.assign(next.notifications, rest);
    if (quietHours) Object.assign(next.notifications.quietHours, quietHours);
  }
  OrganizationProfileSchema.parse(next.organization);
  for (const z of [next.organization.timezone, next.notifications.quietHours.timezone]) {
    if (!isValidZone(z)) throw badRequest(`Unknown IANA timezone: ${z}`);
  }
  const final = WorkspaceSettingsSchema.parse(next);
  db.prepare("UPDATE workspace_settings SET settings_json = ?, updated_at = ? WHERE id = 1").run(
    JSON.stringify(final),
    iso(now),
  );
  return final;
}
