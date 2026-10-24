import type { DeliveryInput } from "@afterhours/contracts";
import { DeliveryError } from "./errors";

const MAX_TITLE = 80;
const MAX_LISTED = 5;
const MAX_MESSAGE = 1000;

/** Titles can come from email subjects or a model: flatten them and never let them carry links or control characters. */
export function safeTitle(title: string): string {
  const flat = title
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const text = flat.length > 0 ? flat : "Untitled request";
  const chars = [...text];
  return chars.length > MAX_TITLE ? `${chars.slice(0, MAX_TITLE - 1).join("").trimEnd()}…` : text;
}

/** Validated base of PUBLIC_APP_URL without trailing slash. Throws DeliveryError when unusable. */
export function appBase(publicAppUrl: string): string {
  let url: URL;
  try {
    url = new URL(publicAppUrl);
  } catch {
    throw new DeliveryError("DELIVERY_CONFIG", "PUBLIC_APP_URL is not a valid URL.", false);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new DeliveryError("DELIVERY_CONFIG", "PUBLIC_APP_URL must be http or https.", false);
  }
  if (url.username || url.password) throw new DeliveryError("DELIVERY_CONFIG", "PUBLIC_APP_URL must not contain credentials.", false);
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** The single link a notification carries: the task for one result, the queue otherwise. */
export function reviewUrl(input: DeliveryInput): string {
  const base = appBase(input.publicAppUrl);
  const only = input.tasks.length === 1 ? input.tasks[0] : undefined;
  return only ? `${base}/tasks/${encodeURIComponent(only.id)}` : `${base}/`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Concise review notification. Contains only titles, counts, and a link built from validated config and known IDs. */
export function composeNotification(input: DeliveryInput): string {
  const url = reviewUrl(input);
  const tasks = input.tasks;
  let text: string;
  if (tasks.length === 0) {
    text = `Nothing new is waiting for review. Queue: ${url}`;
  } else if (tasks.length === 1) {
    const t = tasks[0]!;
    text = `Ready to review: ${safeTitle(t.title)}.\n${plural(t.artifactCount, "file", "files")} prepared. Review: ${url}`;
  } else {
    const listed = tasks.slice(0, MAX_LISTED).map((t) => `• ${safeTitle(t.title)}`);
    const rest = tasks.length - listed.length;
    const lines = [
      `Good morning. ${plural(tasks.length, "request is", "requests are")} ready for review.`,
      ...listed,
      ...(rest > 0 ? [`…and ${rest} more`] : []),
      `Review your queue: ${url}`,
    ];
    text = lines.join("\n");
  }
  return text.length > MAX_MESSAGE ? `${text.slice(0, MAX_MESSAGE - 1)}…` : text;
}
