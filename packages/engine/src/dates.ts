const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"] as const;

interface LocalDateTime { year: number; month: number; day: number; hour: number; minute: number }

function localParts(instant: Date, timezone: string): LocalDateTime & { weekday: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hourCycle: "h23", weekday: "long",
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute),
    weekday: WEEKDAYS.indexOf(parts.weekday!.toLowerCase() as typeof WEEKDAYS[number]),
  };
}

function zonedToUtc(value: LocalDateTime, timezone: string): Date {
  let candidate = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute);
  for (let pass = 0; pass < 3; pass += 1) {
    const seen = localParts(new Date(candidate), timezone);
    const wantedAsUtc = Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    candidate += wantedAsUtc - seenAsUtc;
  }
  return new Date(candidate);
}

function clock(hourText: string, minuteText: string | undefined, meridiem: string): { hour: number; minute: number } {
  let hour = Number(hourText) % 12;
  if (meridiem.toLowerCase() === "pm") hour += 12;
  return { hour, minute: Number(minuteText ?? 0) };
}

export interface ResolvedDeadline { dueAt: string; explanation: string }

const monthIndex = (name: string) => MONTHS.indexOf(name.toLowerCase() as typeof MONTHS[number]) + 1;

/**
 * Year for a month/day stated without one: the first occurrence on or after the email's local
 * receipt date in the organization timezone (never the machine clock or ingestion time).
 */
export function inferYear(month: number, day: number, receivedAt: string, timezone: string): number {
  const received = localParts(new Date(receivedAt), timezone);
  const stated = month * 100 + day;
  return stated >= received.month * 100 + received.day ? received.year : received.year + 1;
}

/** Local calendar key ("october 26") for an instant, used to allow resolved dates in content checks. */
export function localDateKey(instant: string, timezone: string): string {
  const parts = localParts(new Date(instant), timezone);
  return `${MONTHS[parts.month - 1]} ${parts.day}`;
}

export function formatLocal(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(instant));
}

/** Every explicitly requested draft deadline in the text. Engagement dates are deliberately separate. */
export function resolveDeadlines(text: string, receivedAt: string, timezone: string): ResolvedDeadline[] {
  const found: ResolvedDeadline[] = [];
  const absolute = /(?:by\s+)?(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi;
  for (const match of text.matchAll(absolute)) {
    const month = monthIndex(match[1]!);
    if (month === 0) continue;
    const day = Number(match[2]);
    const year = match[3] ? Number(match[3]) : inferYear(month, day, receivedAt, timezone);
    const time = clock(match[4]!, match[5], match[6]!);
    found.push({
      dueAt: zonedToUtc({ year, month, day, ...time }, timezone).toISOString(),
      explanation: `Draft deadline stated in the email: ${match[1]} ${day}, ${year} at ${match[4]}:${String(time.minute).padStart(2, "0")} ${match[6]!.toUpperCase()} ${timezone}${match[3] ? "" : " (year inferred from email.receivedAt)"}. This is separate from the engagement schedule.`,
    });
  }
  const relative = /(?:by\s+)?next\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi;
  for (const match of text.matchAll(relative)) {
    const received = localParts(new Date(receivedAt), timezone);
    const target = WEEKDAYS.indexOf(match[1]!.toLowerCase() as typeof WEEKDAYS[number]);
    const daysAhead = ((target - received.weekday + 7) % 7) || 7;
    const date = new Date(Date.UTC(received.year, received.month - 1, received.day + daysAhead));
    const time = clock(match[2]!, match[3], match[4]!);
    found.push({
      dueAt: zonedToUtc({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), ...time }, timezone).toISOString(),
      explanation: `“Next ${match[1]}” was resolved from email.receivedAt (${receivedAt}) in ${timezone}; task ingestion time was not used.`,
    });
  }
  return found;
}

export function resolveDeadline(text: string, receivedAt: string, timezone: string): ResolvedDeadline | null {
  return resolveDeadlines(text, receivedAt, timezone)[0] ?? null;
}
