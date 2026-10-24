import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { GeneratedFile } from "@afterhours/contracts";
import type { StoredFile } from "./queue";

const SAFE = /^[A-Za-z0-9._-]{1,200}$/;
const SIGNATURES = { docx: "word/document.xml", pptx: "ppt/presentation.xml" } as const;
const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;
export const MIME_BY_FORMAT = MIME;

export class ArtifactValidationError extends Error {}

/** Check a generated file is a real Office ZIP container for its declared format. */
export function validateOfficeBytes(f: Pick<GeneratedFile, "format" | "bytes" | "id" | "filename">): void {
  const b = f.bytes;
  if (!b || b.byteLength < 100) throw new ArtifactValidationError(`${f.filename}: file is empty or too small`);
  if (!(b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)) {
    throw new ArtifactValidationError(`${f.filename}: not a ZIP/Office container`);
  }
  const text = Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("latin1");
  if (!text.includes("[Content_Types].xml") || !text.includes(SIGNATURES[f.format])) {
    throw new ArtifactValidationError(`${f.filename}: missing required ${f.format} parts`);
  }
}

export const sha256Bytes = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

export function sanitizeFilename(name: string, fallback: string): string {
  const base = path.basename(name).replace(/[^\w.\- ()]/g, "_").replace(/^\.+/, "").slice(0, 120).trim();
  return base || fallback;
}

/**
 * Write files into a staging directory, then atomically rename each into
 * <root>/<taskId>/r<revision>/. Paths are deterministic, so a retry after a crash rewrites the
 * same names. Returns manifest rows; the DB manifest is published only after this succeeds fully.
 */
export function publishArtifactFiles(root: string, taskId: string, revision: number, files: GeneratedFile[]): StoredFile[] {
  if (!SAFE.test(taskId)) throw new ArtifactValidationError("Unsafe task id");
  const staging = path.join(root, ".staging", randomUUID());
  const finalDir = path.join(root, taskId, `r${revision}`);
  mkdirSync(staging, { recursive: true });
  mkdirSync(finalDir, { recursive: true });
  try {
    const seen = new Set<string>();
    const prepared = files.map((f) => {
      if (!SAFE.test(f.id)) throw new ArtifactValidationError(`Unsafe file id: ${f.id}`);
      const key = `${f.productId}/${f.format}`;
      if (seen.has(key)) throw new ArtifactValidationError(`Duplicate file for product ${f.productId} (${f.format})`);
      seen.add(key);
      if (f.mimeType !== MIME[f.format]) throw new ArtifactValidationError(`${f.filename}: MIME type does not match ${f.format}`);
      validateOfficeBytes(f);
      const rel = path.posix.join(taskId, `r${revision}`, `${f.id}.${f.format}`);
      return { f, rel, sha: sha256Bytes(f.bytes) };
    });
    for (const p of prepared) writeFileSync(path.join(staging, `${p.f.id}.${p.f.format}`), p.f.bytes, { mode: 0o640 });
    const out: StoredFile[] = [];
    for (const p of prepared) {
      renameSync(path.join(staging, `${p.f.id}.${p.f.format}`), path.join(root, p.rel));
      const size = statSync(path.join(root, p.rel)).size;
      if (size !== p.f.bytes.byteLength) throw new ArtifactValidationError(`${p.f.filename}: size mismatch after write`);
      out.push({
        id: p.f.id, productId: p.f.productId, format: p.f.format,
        filename: sanitizeFilename(p.f.filename, `${p.f.id}.${p.f.format}`),
        mimeType: p.f.mimeType, sizeBytes: size, sha256: p.sha, relPath: p.rel,
      });
    }
    return out;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Resolve a stored relative path to an absolute path strictly inside root. Rejects symlinks/escapes. */
export function resolveArtifactPath(root: string, rel: string): string | null {
  if (rel.includes("\0") || path.isAbsolute(rel) || rel.split(/[\\/]/).includes("..")) return null;
  const full = path.resolve(root, rel);
  const rootReal = realpathSync(root);
  try {
    if (lstatSync(full).isSymbolicLink()) return null;
    const real = realpathSync(full);
    if (!real.startsWith(rootReal + path.sep)) return null;
    return real;
  } catch {
    return null;
  }
}

/** Remove leftover staging dirs older than `maxAgeMs`. Orphaned final files stay (unreferenced, harmless). */
export function cleanStaging(root: string, nowMs: number, maxAgeMs = 3600_000): number {
  const dir = path.join(root, ".staging");
  let n = 0;
  try {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (nowMs - statSync(p).mtimeMs > maxAgeMs) { rmSync(p, { recursive: true, force: true }); n++; }
    }
  } catch { /* none */ }
  return n;
}
