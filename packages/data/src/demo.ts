import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  DemoFixtureSchema, OrganizationProfileSchema,
  type FixtureScenario, type OrganizationProfile,
} from "@afterhours/contracts";
import type { AppConfig } from "./config";
import type { Db } from "./db";
import { DomainError } from "./errors";
import { ingestMessage, type IngestAttachment, type IngestOutcome } from "./ingest";
import { newId } from "./util";

const fixturesDir = (root: string) => path.join(root, "fixtures");

export function loadOrganizationFixture(root: string): OrganizationProfile {
  const file = path.join(fixturesDir(root), "organization", "harbor-creative.json");
  return OrganizationProfileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** Resolve a trusted fixture-relative path inside fixtures/. Rejects traversal and symlink escapes. */
export function resolveFixturePath(root: string, rel: string): string {
  const base = realpathSync(fixturesDir(root));
  const full = path.resolve(base, rel);
  if (rel.includes("\0") || path.isAbsolute(rel)) throw fixtureError(`Unsafe fixture path: ${rel}`);
  const real = realpathSync(full);
  if (!real.startsWith(base + path.sep)) throw fixtureError(`Fixture path escapes fixtures/: ${rel}`);
  return real;
}

const fixtureError = (m: string) => new DomainError("FIXTURE_INVALID", m, 500);

export function loadDemoFixture(root: string, scenario: FixtureScenario) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path.join(fixturesDir(root), "scenarios", `${scenario}.json`), "utf8"));
  } catch {
    throw fixtureError(`Fixture scenario "${scenario}" is missing or unreadable.`);
  }
  const parsed = DemoFixtureSchema.safeParse(raw);
  if (!parsed.success) throw fixtureError(`Fixture scenario "${scenario}" is invalid: ${parsed.error.issues[0]?.message}`);
  const fx = parsed.data;
  const attachments: IngestAttachment[] = fx.attachmentFiles.map((a) => {
    const meta = fx.email.attachments.find((m) => m.id === a.attachmentId);
    if (!meta) throw fixtureError(`Fixture attachment ${a.attachmentId} has no envelope metadata.`);
    const bytes = readFileSync(resolveFixturePath(root, a.relativePath));
    if (bytes.byteLength !== meta.sizeBytes) {
      throw fixtureError(`Fixture attachment ${meta.filename} is ${bytes.byteLength} bytes; envelope says ${meta.sizeBytes}.`);
    }
    return { id: meta.id, filename: meta.filename, mimeType: meta.mimeType, bytes: new Uint8Array(bytes) };
  });
  return { fixture: fx, attachments };
}

/**
 * Inject a demo email through the same ingestion path as Gmail. replayKey makes it idempotent.
 *
 * The fixture's own `receivedAt` is preserved so date interpretation ("next Monday") is deterministic across
 * runs. Ingestion time is recorded separately as the task/intake `created_at` (TaskSummary.createdAt).
 */
export function injectDemo(
  db: Db, config: Pick<AppConfig, "repoRoot" | "generationMode">,
  scenario: FixtureScenario, replayKey: string | undefined, now: Date,
): IngestOutcome {
  const { fixture, attachments } = loadDemoFixture(config.repoRoot, scenario);
  const providerMessageId = `demo:${scenario}:${replayKey ?? newId()}`;
  return ingestMessage(db, {
    sourceKey: providerMessageId,
    mode: "demo",
    integrationId: null,
    envelope: { ...fixture.email, providerMessageId },
    attachments,
    generationMode: config.generationMode,
    fixtureScenario: scenario,
  }, now);
}
