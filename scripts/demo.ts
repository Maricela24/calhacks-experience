// Real HTTP POST to the authenticated local demo endpoint. Uses the restricted CLI bearer token.
import { findRepoRoot, loadRootEnv } from "@afterhours/data";

loadRootEnv(findRepoRoot());
const scenario = process.argv[2];
if (!scenario || !["proposal", "report", "ambiguous", "no_action"].includes(scenario)) {
  console.error("Usage: tsx scripts/demo.ts proposal|report|ambiguous|no_action");
  process.exit(1);
}
const token = process.env.DEMO_CLI_TOKEN;
if (!token) {
  console.error("DEMO_CLI_TOKEN is not set. Run: pnpm setup:local");
  process.exit(1);
}
const api = (process.env.API_ORIGIN ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const app = (process.env.PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

try {
  const res = await fetch(`${api}/v1/demo/inject`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ scenario }),
  });
  const body = (await res.json().catch(() => null)) as
    | { data?: { taskId: string; deduplicated: boolean }; error?: { code: string; message: string } }
    | null;
  if (!res.ok || !body?.data) {
    console.error(`Injection failed (${res.status}): ${body?.error?.code ?? "unknown"} ${body?.error?.message ?? ""}`);
    process.exit(1);
  }
  console.log(`Queued demo "${scenario}" task: ${body.data.taskId}`);
  console.log(`Review it at: ${app}/tasks/${body.data.taskId}`);
} catch (e) {
  console.error(`Could not reach the API at ${api}. Is "pnpm dev" running? (${e instanceof Error ? e.message : "error"})`);
  process.exit(1);
}
