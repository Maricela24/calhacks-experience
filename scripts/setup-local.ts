// Idempotent local setup. Creates .env from .env.example, fills ONLY empty secrets, creates dirs.
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { findRepoRoot } from "@afterhours/data";

const root = findRepoRoot();
const envPath = path.join(root, ".env");
let created = false;
if (!existsSync(envPath)) {
  copyFileSync(path.join(root, ".env.example"), envPath);
  created = true;
}

const generators: Record<string, () => string> = {
  SESSION_SECRET: () => randomBytes(32).toString("hex"),
  TOKEN_ENCRYPTION_KEY: () => randomBytes(32).toString("base64"),
  DEMO_CLI_TOKEN: () => randomBytes(24).toString("base64url"),
  APP_PASSWORD: () => randomBytes(9).toString("base64url"),
};
const filled: string[] = [];
const lines = readFileSync(envPath, "utf8").split("\n").map((line) => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && generators[m[1]!] && m[2]!.trim() === "") {
    filled.push(m[1]!);
    return `${m[1]}=${generators[m[1]!]!()}`;
  }
  return line;
});
if (filled.length) writeFileSync(envPath, lines.join("\n"), { mode: 0o600 });

for (const d of ["var", "var/artifacts"]) mkdirSync(path.join(root, d), { recursive: true });

console.log(created ? "Created .env from .env.example." : ".env already exists (kept).");
console.log(filled.length ? `Generated missing values: ${filled.join(", ")}` : "No missing secrets to generate.");
console.log("Created var/ and var/artifacts/.");
console.log('Login password: open .env and read APP_PASSWORD (or set your own value there). Never commit .env.');
