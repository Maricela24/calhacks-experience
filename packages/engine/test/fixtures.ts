import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DemoFixture, EngineInput, OrganizationProfile } from "@afterhours/contracts";

export const root = resolve(import.meta.dirname, "../../..");
export const loadJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(resolve(root, path), "utf8")) as T;

/** Builds the same EngineInput the worker builds from a public fictional fixture. */
export async function inputFor(scenario: DemoFixture["scenario"], overrides: Partial<EngineInput> = {}): Promise<EngineInput> {
  const fixture = await loadJson<DemoFixture>(`fixtures/scenarios/${scenario}.json`);
  const organization = await loadJson<OrganizationProfile>("fixtures/organization/harbor-creative.json");
  const attachments = await Promise.all(fixture.attachmentFiles.map(async (entry) => {
    const meta = fixture.email.attachments.find((item) => item.id === entry.attachmentId)!;
    return { id: meta.id, filename: meta.filename, mimeType: meta.mimeType, bytes: new Uint8Array(await readFile(resolve(root, "fixtures", entry.relativePath))) };
  }));
  return { taskId: `task-${scenario}`, revision: 1, mode: "fixture", email: fixture.email, attachments, organization, answers: [], now: "2026-10-23T20:00:00.000Z", fixtureScenario: scenario, ...overrides };
}

export const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
export const bytesOf = (value: string) => new TextEncoder().encode(value);

/** Replaces the text of the first attachment, keeping its metadata. */
export function withAttachmentText(input: EngineInput, edit: (value: string) => string): EngineInput {
  const first = input.attachments[0]!;
  const bytes = bytesOf(edit(text(first.bytes)));
  return {
    ...input,
    attachments: [{ ...first, bytes }, ...input.attachments.slice(1)],
    email: { ...input.email, attachments: input.email.attachments.map((meta) => meta.id === first.id ? { ...meta, sizeBytes: bytes.byteLength } : meta) },
  };
}
