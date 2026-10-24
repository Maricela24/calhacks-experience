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

/** Resolve only an explicitly requested deadline. Engagement dates are deliberately separate. */
export function resolveDeadline(text: string, receivedAt: string, timezone: string): ResolvedDeadline | null {
  const absolute = text.match(/(?:by\s+)?(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (absolute) {
    const month = MONTHS.indexOf(absolute[1]!.toLowerCase() as typeof MONTHS[number]) + 1;
    if (month > 0) {
      const time = clock(absolute[4]!, absolute[5], absolute[6]!);
      const local = { year: Number(absolute[3]), month, day: Number(absolute[2]), ...time };
      return {
        dueAt: zonedToUtc(local, timezone).toISOString(),
        explanation: `Draft deadline stated in the email: ${absolute[1]} ${absolute[2]}, ${absolute[3]} at ${absolute[4]}:${String(time.minute).padStart(2, "0")} ${absolute[6]!.toUpperCase()} ${timezone}. This is separate from the engagement schedule.`,
      };
    }
  }

  const relative = text.match(/(?:by\s+)?next\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!relative) return null;
  const received = localParts(new Date(receivedAt), timezone);
  const target = WEEKDAYS.indexOf(relative[1]!.toLowerCase() as typeof WEEKDAYS[number]);
  const daysAhead = ((target - received.weekday + 7) % 7) || 7;
  const date = new Date(Date.UTC(received.year, received.month - 1, received.day + daysAhead));
  const time = clock(relative[2]!, relative[3], relative[4]!);
  return {
    dueAt: zonedToUtc({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), ...time }, timezone).toISOString(),
    explanation: `“Next ${relative[1]}” was resolved from email.receivedAt (${receivedAt}) in ${timezone}; task ingestion time was not used.`,
  };
}
