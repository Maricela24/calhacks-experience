import { createHash } from "node:crypto";

export function stableId(...parts: Array<string | number>): string {
  const label = parts.map(String).join("/").replace(/[^a-zA-Z0-9._/-]+/g, "-");
  const hash = createHash("sha256").update(label).digest("hex").slice(0, 12);
  return `${label.slice(0, 80)}-${hash}`;
}

export function safeFilename(value: string): string {
  const cleaned = value.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned.slice(0, 80) || "AfterHours";
}
