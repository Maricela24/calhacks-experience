/**
 * Writes the current fixture-mode Office outputs to an ignored directory for visual inspection.
 * Usage: corepack pnpm exec tsx packages/engine/test/render-samples.ts [outDir]
 * Default outDir is var/engine-samples (git-ignored). Prints filename, MIME, bytes, and SHA-256.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { EngineInput } from "@afterhours/contracts";
import { runWork } from "../src/index";
import { syntheticInputs } from "./synthetic";
import { inputFor, root } from "./fixtures";

const out = resolve(root, process.argv[2] ?? "var/engine-samples");
await mkdir(out, { recursive: true });
const cases: Array<[string, EngineInput]> = [
  ["proposal", await inputFor("proposal")],
  ["report", await inputFor("report")],
  ...Object.entries(await syntheticInputs()),
];
for (const [name, input] of cases) {
  const result = await runWork(input, { signal: new AbortController().signal, onProgress: async () => undefined });
  if (result.outcome !== "ready") { console.log(`${name}: ${result.outcome}`); continue; }
  for (const file of result.files) {
    const filename = `${name}--${file.filename}`;
    await writeFile(resolve(out, filename), file.bytes);
    console.log([filename, file.mimeType.split(".").at(-1), file.bytes.byteLength, createHash("sha256").update(file.bytes).digest("hex")].join("\t"));
  }
}
