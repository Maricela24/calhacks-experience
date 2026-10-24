import { expect, test, type Page } from "@playwright/test";
import {
  BASE, CLI_TOKEN, PASSWORD, downloadFile, expectOfficeZip, inject, login, probeEngine, readZip, statusBadge, taskStatus, xmlText,
} from "./helpers";

test.describe.configure({ mode: "serial" });

const BLOCKED = "BLOCKED: the engine is still the foundation stub (ENGINE_NOT_IMPLEMENTED), so no ready task can exist. Not a pass.";

/** Logs in and skips (BLOCKED) when the real engine is not installed. */
async function needEngine(page: Page) {
  await login(page);
  const probe = await probeEngine(page);
  test.skip(!probe.real, `${BLOCKED} (${probe.detail})`);
}

test("0. with the stub engine, failure is honest: failed state, no files, no review", async ({ page }) => {
  await login(page);
  const probe = await probeEngine(page);
  test.skip(probe.real, "Engine is real; the stub-failure check does not apply.");
  const { taskId } = await inject(page.request, "proposal");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "failed")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Preparation failed" })).toBeVisible();
  await expect(page.getByText("ENGINE_NOT_IMPLEMENTED").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Download/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry preparation" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("article", { name: /Maple|Proposal/i }).first()).toContainText("ENGINE_NOT_IMPLEMENTED");
});

test("1. proposal: inject, observe progress, preview both products, download real files, mark reviewed, persists", async ({ page }) => {
  await needEngine(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Run demo/ }).click();
  await page.getByRole("button", { name: /Proposal \+ kickoff deck/ }).click();
  await page.waitForURL(/\/tasks\/[^/]+$/);
  const taskId = page.url().split("/").pop()!;
  test.info().annotations.push({ type: "taskId", description: taskId });

  // Real, persisted progress is visible while the worker runs.
  await page.getByRole("tab", { name: /^Activity/ }).click();
  await expect(page.getByRole("tabpanel").getByText("Reading request").first()).toBeVisible();
  await expect(statusBadge(page, "ready")).toBeVisible({ timeout: 90_000 });

  // One proposal document and one presentation, both previewable.
  await expect(page.getByRole("heading", { name: "Content preview" })).toBeVisible();
  const productTabs = page.getByRole("tablist", { name: "Products" }).getByRole("tab");
  await expect(productTabs).toHaveCount(2);
  const docTitle = (await page.locator(".doc-title").innerText()).trim();
  await expect(page.locator(".doc-page")).toContainText(/6,000/);
  await productTabs.filter({ hasText: /Presentation/ }).click();
  await expect(page.locator(".thumbs li")).toHaveCount(5);
  const slideTitles = await page.locator(".thumb-title").allInnerTexts();
  await page.locator(".thumb").nth(3).click();
  await expect(page.locator(".slide")).toBeVisible();

  // Source references open the actual excerpt in an accessible dialog.
  await productTabs.filter({ hasText: /Proposal/ }).click();
  const chip = page.locator(".doc-page .chip").first();
  await chip.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Excerpt" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Real downloads: inspect the bytes the browser received, and compare them with the preview.
  const docx = await downloadFile(page, /Download .*\.docx/);
  expect(docx.name).toMatch(/\.docx$/);
  expectOfficeZip(docx.bytes, "word/document.xml");
  const docxParts = readZip(docx.bytes);
  expect(xmlText(docxParts.get("word/document.xml"))).toContain(docTitle);
  expect(xmlText(docxParts.get("word/document.xml"))).toMatch(/6,000/);

  const pptx = await downloadFile(page, /Download .*\.pptx/);
  expect(pptx.name).toMatch(/\.pptx$/);
  expectOfficeZip(pptx.bytes, "ppt/presentation.xml");
  const pptxParts = readZip(pptx.bytes);
  const slideParts = [...pptxParts.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
  expect(slideParts, "five slide parts in the PPTX").toHaveLength(5);
  const deckText = slideParts.map((k) => xmlText(pptxParts.get(k))).join("\n");
  for (const title of slideTitles) expect(deckText).toContain(title.trim());

  // Review is recorded server-side and survives a reload.
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByRole("heading", { name: "Marked reviewed" })).toBeVisible();
  await page.reload();
  await expect(statusBadge(page, "approved")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Marked reviewed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toHaveCount(0);
  expect((await taskStatus(page, taskId)).status).toBe("approved");
});

test("2. report: calculated values appear consistently in the preview and chart data", async ({ page }) => {
  await needEngine(page);
  const { taskId } = await inject(page.request, "report");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "ready")).toBeVisible({ timeout: 90_000 });
  const main = page.getByRole("main");
  for (const value of [/12,000/, /15,000/, /3,000/, /25%/]) await expect(main.locator(".doc-page")).toContainText(value);
  const chart = page.locator(".chart-svg").first();
  await expect(chart).toHaveAttribute("aria-label", /12,000/);
  await expect(chart).toHaveAttribute("aria-label", /15,000/);
  await page.getByText(/^Chart data/).first().click();
  await expect(page.locator(".chart-data table").first()).toContainText("12,000");
});

test("3. ambiguous: answer the questions, get a new revision, and generation resumes", async ({ page }) => {
  await needEngine(page);
  const { taskId } = await inject(page.request, "ambiguous");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "needs_input")).toBeVisible({ timeout: 90_000 });
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: /Submit answers/ }) });

  // Required answers are enforced before anything is sent.
  await form.getByRole("button", { name: /Submit answers/ }).click();
  await expect(form.getByText("This answer is required.").first()).toBeVisible();
  expect((await taskStatus(page, taskId)).revision).toBe(1);

  const areas = form.locator("textarea");
  const n = await areas.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await areas.nth(i).fill(`Answer ${i + 1}: Maple & Moss needs a brand refresh and a website content plan.`);
  await form.getByRole("button", { name: /Submit answers/ }).click();
  await expect(page.getByText(/Revision 2/).first()).toBeVisible({ timeout: 30_000 });
  await expect(statusBadge(page, "ready")).toBeVisible({ timeout: 90_000 });
  expect((await taskStatus(page, taskId)).revision).toBe(2);
});

test("4. duplicate replayKey returns one task", async ({ page }) => {
  await login(page);
  const key = `e2e-dup-${Date.now()}`;
  const before = await page.request.get(`${BASE}/api/tasks?limit=100`);
  const countBefore = ((await before.json()) as { data: { items: unknown[] } }).data.items.length;
  const first = await inject(page.request, "proposal", key);
  const second = await inject(page.request, "proposal", key);
  expect(second.taskId).toBe(first.taskId);
  expect(first.deduplicated).toBe(false);
  expect(second.deduplicated).toBe(true);
  const after = await page.request.get(`${BASE}/api/tasks?limit=100`);
  expect(((await after.json()) as { data: { items: unknown[] } }).data.items.length).toBe(countBefore + 1);
});

test("5. no_action is skipped and offers no downloads", async ({ page }) => {
  await needEngine(page);
  const { taskId } = await inject(page.request, "no_action");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "skipped")).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("heading", { name: "No action needed" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Download/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toHaveCount(0);
});

test("6. notifications are labeled honestly (simulated outbox, never delivered)", async ({ page }) => {
  await needEngine(page);
  const { taskId } = await inject(page.request, "proposal");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "ready")).toBeVisible({ timeout: 90_000 });
  await page.goto("/notifications");
  await expect(page.getByText("Simulated (outbox)").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/not sent to any phone or inbox/).first()).toBeVisible();
  await expect(page.getByText("Delivered", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Accepted by provider")).toHaveCount(0);
});

test("7. an unauthenticated deep link goes to login and returns to the task", async ({ browser, page, request }) => {
  await login(page);
  const { taskId } = await inject(page.request, "no_action");
  const ctx = await browser.newContext();
  const anon = await ctx.newPage();
  await anon.goto(`${BASE}/tasks/${taskId}`);
  await anon.waitForURL(/\/login\?returnTo=/);
  expect(decodeURIComponent(new URL(anon.url()).searchParams.get("returnTo") ?? "")).toBe(`/tasks/${taskId}`);
  await anon.getByLabel("Password").fill("definitely-wrong");
  await anon.getByRole("button", { name: "Sign in" }).click();
  await expect(anon.getByText("Incorrect password.")).toBeVisible();
  await anon.getByLabel("Password").fill(PASSWORD);
  await anon.getByRole("button", { name: "Sign in" }).click();
  await anon.waitForURL(`${BASE}/tasks/${taskId}`);
  await expect(anon.getByRole("heading", { level: 1 })).toBeVisible();

  // External returnTo values are never followed; the CLI token cannot read private data.
  const evil = await ctx.newPage();
  await evil.goto(`${BASE}/login?returnTo=${encodeURIComponent("https://evil.example/")}`);
  await expect(evil.getByRole("heading", { name: "Private workspace" })).toBeVisible();
  expect(new URL(evil.url()).origin).toBe(new URL(BASE).origin);
  const cli = await request.get(`${BASE}/api/tasks`, { headers: { authorization: `Bearer ${CLI_TOKEN}` }, failOnStatusCode: false });
  expect(cli.status()).toBe(401);
  // Artifact downloads are private too.
  const dl = await request.get(`${BASE}/api/artifacts/anything/download`, { failOnStatusCode: false });
  expect(dl.status()).toBe(401);
  await ctx.close();
});

test("8. a stale review gets a 409 refresh prompt and approves nothing", async ({ page }) => {
  await needEngine(page);
  const { taskId } = await inject(page.request, "proposal");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "ready")).toBeVisible({ timeout: 90_000 });
  // Make the browser submit an out-of-date revision to the real API.
  await page.route("**/api/tasks/*/review", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.continue({ postData: JSON.stringify({ ...body, revision: 99 }) });
  });
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByText("This task changed. Refresh to review the latest version.").first()).toBeVisible();
  expect((await taskStatus(page, taskId)).status).toBe("ready");
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toBeDisabled();
  await page.unroute("**/api/tasks/*/review");
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toBeEnabled();
});

test("9. queue and detail are usable on a phone-sized screen", async ({ browser, page }) => {
  await needEngine(page);
  const { taskId } = await inject(page.request, "proposal");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() });
  const m = await ctx.newPage();
  const noOverflow = async () => expect(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await m.goto(`${BASE}/`);
  await expect(m.getByRole("heading", { name: "Work queue" })).toBeVisible();
  await noOverflow();
  await m.goto(`${BASE}/tasks/${taskId}`);
  await expect(statusBadge(m, "ready")).toBeVisible({ timeout: 90_000 });
  await noOverflow();
  const button = m.getByRole("button", { name: "Mark reviewed" });
  await button.scrollIntoViewIfNeeded();
  expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
  await m.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(m.getByRole("heading", { name: "Marked reviewed" })).toBeVisible();
  await noOverflow();
  await ctx.close();
});

test("10. settings persist across a reload", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  const name = page.getByLabel("Name", { exact: true });
  await expect(name).toBeVisible();
  const original = await name.inputValue();
  await name.fill(`${original} QA`);
  await expect(page.getByText("Unsaved changes").first()).toBeVisible();
  await page.getByRole("form", { name: "Organization" }).getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(`${original} QA`);
});

test("11. ingestion time and original email time are labeled separately and are the real values", async ({ page }) => {
  await login(page);
  const { taskId } = await inject(page.request, "proposal");
  const res = await page.request.get(`${BASE}/api/tasks/${taskId}`);
  const detail = ((await res.json()) as { data: { task: { createdAt: string }; email: { receivedAt: string } } }).data;
  const settings = await page.request.get(`${BASE}/api/settings`);
  const tz = ((await settings.json()) as { data: { organization: { timezone: string } } }).data.organization.timezone;
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: tz, dateStyle: "medium" });

  await page.goto(`/tasks/${taskId}`);
  const times = page.getByTestId("task-times");
  await expect(times.getByText(/^Entered the system/)).toContainText(day(detail.task.createdAt));
  await expect(times.getByText(/^Original email received/)).toContainText(day(detail.email.receivedAt));
  expect(day(detail.email.receivedAt)).not.toBe(day(detail.task.createdAt)); // fixture dates are intentionally old

  // The request tab carries both labels as well.
  await page.getByRole("tab", { name: "Original request" }).click();
  await expect(page.getByRole("tabpanel").getByText("Original email received", { exact: true })).toBeVisible();
  await expect(page.getByRole("tabpanel").getByText("Entered the system", { exact: true })).toBeVisible();

  // Queue cards show only ingestion time, and say so.
  await page.goto("/");
  await expect(page.getByRole("article").first()).toContainText("entered the system");
});

test("12. keyboard: source dialog opens and closes with focus restored, and review works without a mouse", async ({ page }) => {
  await needEngine(page);
  const { taskId } = await inject(page.request, "proposal");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "ready")).toBeVisible({ timeout: 90_000 });
  const chip = page.locator(".doc-page .chip").first();
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(chip).toBeFocused();

  const review = page.getByRole("button", { name: "Mark reviewed" });
  await review.focus();
  await expect(review).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Marked reviewed" })).toBeVisible();
});
