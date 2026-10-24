import { expect, test } from "@playwright/test";
import { BASE, CLI_TOKEN, PASSWORD, downloadFile, expectOfficeZip, inject, login, statusBadge, taskStatus } from "./helpers";

test.describe.configure({ mode: "serial" });

test("1. proposal: inject, observe progress, preview both products, download real files, mark reviewed, persists", async ({ page }) => {
  await login(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Run demo/ }).click();
  await page.getByRole("button", { name: /Proposal \+ kickoff deck/ }).click();
  await page.waitForURL(/\/tasks\/[^/]+$/);

  // Real, persisted progress is visible while the worker runs.
  await page.getByRole("tab", { name: /^Activity/ }).click();
  await expect(page.getByRole("tabpanel").getByText("Reading request").first()).toBeVisible();
  await expect(statusBadge(page, "ready")).toBeVisible({ timeout: 60_000 });

  // One proposal document and one presentation, both previewable.
  await expect(page.getByRole("heading", { name: "Content preview" })).toBeVisible();
  const productTabs = page.getByRole("tablist", { name: "Products" }).getByRole("tab");
  await expect(productTabs).toHaveCount(2);
  await expect(page.locator(".doc-page")).toContainText(/6,000/);
  await productTabs.filter({ hasText: /Presentation/ }).click();
  await expect(page.locator(".thumbs li")).toHaveCount(5);
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

  // Real downloads, verified as Office ZIP containers.
  const docx = await downloadFile(page, /Download .*\.docx/);
  expect(docx.name).toMatch(/\.docx$/);
  expectOfficeZip(docx.bytes, "word/document.xml");
  const pptx = await downloadFile(page, /Download .*\.pptx/);
  expect(pptx.name).toMatch(/\.pptx$/);
  expectOfficeZip(pptx.bytes, "ppt/presentation.xml");

  // Review is recorded server-side and survives a reload.
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByRole("heading", { name: "Marked reviewed" })).toBeVisible();
  await page.reload();
  await expect(statusBadge(page, "approved")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Marked reviewed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toHaveCount(0);
});

test("2. report: calculated values appear consistently in the preview and chart data", async ({ page }) => {
  await login(page);
  const { taskId } = await inject(page.request, "report");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "ready")).toBeVisible({ timeout: 60_000 });
  const main = page.getByRole("main");
  for (const value of [/12,000/, /15,000/, /3,000/, /25%/]) await expect(main.locator(".doc-page")).toContainText(value);
  const chart = page.locator(".chart-svg").first();
  await expect(chart).toHaveAttribute("aria-label", /12,000/);
  await expect(chart).toHaveAttribute("aria-label", /15,000/);
  await page.getByText(/^Chart data/).first().click();
  await expect(page.locator(".chart-data table").first()).toContainText("12,000");
});

test("3. ambiguous: answer the questions, get a new revision, and generation resumes", async ({ page }) => {
  await login(page);
  const { taskId } = await inject(page.request, "ambiguous");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "needs_input")).toBeVisible({ timeout: 60_000 });
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
  await expect(statusBadge(page, "ready")).toBeVisible({ timeout: 60_000 });
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
  await login(page);
  const { taskId } = await inject(page.request, "no_action");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "skipped")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "No action needed" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Download/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark reviewed" })).toHaveCount(0);
});

test("6. notifications are labeled honestly (simulated outbox, never delivered)", async ({ page }) => {
  await login(page);
  const { taskId } = await inject(page.request, "proposal");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "ready")).toBeVisible({ timeout: 60_000 });
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
  await ctx.close();
});

test("8. a stale review gets a 409 refresh prompt and approves nothing", async ({ page }) => {
  await login(page);
  const { taskId } = await inject(page.request, "proposal");
  await page.goto(`/tasks/${taskId}`);
  await expect(statusBadge(page, "ready")).toBeVisible({ timeout: 60_000 });
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
  await login(page);
  const { taskId } = await inject(page.request, "proposal");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await page.context().storageState() });
  const m = await ctx.newPage();
  const noOverflow = async () => expect(await m.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await m.goto(`${BASE}/`);
  await expect(m.getByRole("heading", { name: "Work queue" })).toBeVisible();
  await noOverflow();
  await m.goto(`${BASE}/tasks/${taskId}`);
  await expect(statusBadge(m, "ready")).toBeVisible({ timeout: 60_000 });
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
