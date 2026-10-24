import { defineConfig, devices } from "@playwright/test";

// Run through `pnpm test:e2e` (scripts/e2e.mjs), which starts an isolated API, worker, and web app first.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    acceptDownloads: true,
    ...devices["Desktop Chrome"],
  },
});
