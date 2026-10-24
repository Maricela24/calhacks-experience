import { scryptSync, timingSafeEqual } from "node:crypto";
import type { Db } from "./db";
import { addSeconds, iso, newId, randomToken, sha256Hex } from "./util";

export const SESSION_TTL_SECONDS = 7 * 24 * 3600;

/** Hash the application password once at startup; compare in constant time. */
export class PasswordGate {
  private readonly salt: Buffer;
  private readonly hash: Buffer;
  constructor(password: string, salt: Buffer = Buffer.from("afterhours-pw-gate-v1")) {
    this.salt = salt;
    this.hash = scryptSync(password, this.salt, 32);
  }
  verify(candidate: string): boolean {
    const h = scryptSync(candidate, this.salt, 32);
    return timingSafeEqual(h, this.hash);
  }
}

const tokenHash = (secret: string, token: string) => sha256Hex(`${secret}:${token}`);

export function createSession(db: Db, secret: string, now: Date): { token: string; expiresAt: Date } {
  const token = randomToken(32);
  const expiresAt = addSeconds(now, SESSION_TTL_SECONDS);
  db.prepare("INSERT INTO sessions (id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    newId(),
    tokenHash(secret, token),
    iso(now),
    iso(expiresAt),
  );
  return { token, expiresAt };
}

export interface SessionInfo { id: string }

export function lookupSession(db: Db, secret: string, token: string | undefined, now: Date): SessionInfo | null {
  if (!token) return null;
  const row = db
    .prepare("SELECT id, expires_at, revoked_at FROM sessions WHERE token_hash = ?")
    .get(tokenHash(secret, token)) as { id: string; expires_at: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at || row.expires_at <= iso(now)) return null;
  return { id: row.id };
}

export function revokeSession(db: Db, secret: string, token: string | undefined, now: Date): void {
  if (!token) return;
  db.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL").run(
    iso(now),
    tokenHash(secret, token),
  );
}

export function purgeExpiredSessions(db: Db, now: Date): void {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL").run(iso(now));
}
