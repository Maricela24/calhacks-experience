import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

export const PASSWORD = process.env.E2E_PASSWORD ?? "";
export const CLI_TOKEN = process.env.E2E_CLI_TOKEN ?? "";
export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export type Scenario = "proposal" | "report" | "ambiguous" | "no_action";

/** Inject through the real demo endpoint with the restricted CLI token (the same path as `pnpm demo:*`). */
export async function inject(request: APIRequestContext, scenario: Scenario, replayKey?: string) {
  const res = await request.post(`${BASE}/api/demo/inject`, {
    headers: { authorization: `Bearer ${CLI_TOKEN}`, "content-type": "application/json" },
    data: { scenario, replayKey: replayKey ?? `e2e-${scenario}-${Date.now()}-${Math.random().toString(36).slice(2)}` },
  });
  expect(res.ok(), `inject ${scenario}: ${res.status()}`).toBe(true);
  return ((await res.json()) as { data: { taskId: string; deduplicated: boolean } }).data;
}

let cachedCookies: Awaited<ReturnType<ReturnType<Page["context"]>["cookies"]>> | null = null;

/**
 * Sign in through the real session endpoint so the page context carries the session cookie.
 * The login endpoint is rate limited, so the session is created once and reused by later tests.
 */
export async function login(page: Page) {
  if (cachedCookies) {
    await page.context().addCookies(cachedCookies);
    return;
  }
  const res = await page.request.post(`${BASE}/api/session`, {
    headers: { origin: new URL(BASE).origin, "content-type": "application/json" },
    data: { password: PASSWORD },
  });
  expect(res.ok(), `login: ${res.status()}`).toBe(true);
  cachedCookies = await page.context().cookies();
}

export async function taskStatus(page: Page, taskId: string): Promise<{ status: string; revision: number }> {
  const res = await page.request.get(`${BASE}/api/tasks/${taskId}`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { data: { task: { status: string; revision: number } } };
  return body.data.task;
}

export const statusBadge = (page: Page, status: string) => page.locator(`.badge[data-status="${status}"]`).first();

/** Download via the UI button and return the bytes the browser actually received. */
export async function downloadFile(page: Page, buttonName: RegExp) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: buttonName }).click()]);
  const path = await download.path();
  const bytes = readFileSync(path);
  return { name: download.suggestedFilename(), bytes };
}

/** A real Office file is a ZIP container with the expected part names. */
export function expectOfficeZip(bytes: Buffer, entry: string) {
  expect(bytes.length).toBeGreaterThan(100);
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  const text = bytes.toString("latin1");
  expect(text).toContain("[Content_Types].xml");
  expect(text).toContain(entry);
}
