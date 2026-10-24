// Formatting helpers. All timestamps are ISO-8601 UTC; display uses the organization's timezone.

export function formatDateTime(iso: string | null | undefined, timeZone?: string, withSeconds = false): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: withSeconds ? "medium" : "short",
      timeZone,
    }).format(d) + tzSuffix(d, timeZone);
  } catch {
    return d.toISOString();
  }
}

function tzSuffix(d: Date, timeZone?: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone }).formatToParts(d).find((p) => p.type === "timeZoneName");
    return part ? ` ${part.value}` : "";
  } catch {
    return "";
  }
}

export function formatTime(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { timeStyle: "medium", timeZone }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Elapsed time from persisted timestamps, e.g. "1m 12s". */
export function formatElapsed(fromIso: string, nowMs: number): string {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return "—";
  const s = Math.max(0, Math.round((nowMs - from) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function formatRelative(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.round((nowMs - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz.length > 0;
  } catch {
    return false;
  }
}

export function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join("").trimEnd()}…` : text;
}

/** Collapse whitespace the way source quotes are normalized for comparison. */
export function normalizeWs(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}
