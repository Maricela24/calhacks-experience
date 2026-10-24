import { createHash, randomBytes, randomUUID } from "node:crypto";

export const newId = (): string => randomUUID();
export const iso = (d: Date): string => d.toISOString();
export const sha256Hex = (v: string | Uint8Array): string =>
  createHash("sha256").update(v).digest("hex");
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const addSeconds = (d: Date, s: number): Date => new Date(d.getTime() + s * 1000);
