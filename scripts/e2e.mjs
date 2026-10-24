// Browser e2e tests are owned by Person 3 (tests/e2e/**). Until that suite exists this is a loud no-op.
import { readdirSync } from "node:fs";
const files = (() => { try { return readdirSync("tests/e2e").filter((f) => !f.startsWith(".")); } catch { return []; } })();
if (files.length === 0) {
  console.log("SKIPPED: tests/e2e is empty. Person 3 adds the browser suite and replaces this script.");
  process.exit(0);
}
console.error("tests/e2e has files but scripts/e2e.mjs was not updated to run them. Person 3: replace this script.");
process.exit(1);
