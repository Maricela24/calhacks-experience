/** Typed delivery failure. The worker owns retries; `retryable` says whether a retry is safe. */
export class DeliveryError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "DeliveryError";
    this.code = code;
    this.retryable = retryable;
  }
}

const SID = /\b(?:AC|SM|MM|HX|MG|SK)[0-9a-fA-F]{32}\b/g;
const WHATSAPP_ADDRESS = /whatsapp:\s*\+?\d[\d\s().-]*/gi;
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;

/** Remove phone numbers, provider SIDs, and any known secret values from text destined for logs or the database. */
export function redact(text: string, secrets: Array<string | null | undefined> = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("[redacted]");
  return out.replace(WHATSAPP_ADDRESS, "[redacted]").replace(SID, "[redacted]").replace(PHONE, "[redacted]");
}

interface ProviderErrorShape {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  name?: unknown;
}

const REQUEST_NEVER_SENT = new Set(["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"]);
const TIMED_OUT = new Set(["ECONNABORTED", "ETIMEDOUT", "ESOCKETTIMEDOUT", "ECONNRESET", "EPIPE", "UND_ERR_SOCKET"]);

/**
 * Convert an error thrown by the provider client into a DeliveryError with safe text.
 * Anything that may have reached the provider without a clear answer is DELIVERY_UNCERTAIN
 * and non-retryable, so the worker never resends it automatically.
 */
export function mapProviderError(err: unknown, secrets: Array<string | null | undefined> = []): DeliveryError {
  if (err instanceof DeliveryError) return err;
  const e = (typeof err === "object" && err !== null ? err : {}) as ProviderErrorShape;
  const status = typeof e.status === "number" ? e.status : null;
  const providerCode = typeof e.code === "number" ? e.code : null;
  const nodeCode = typeof e.code === "string" ? e.code : null;
  const detail = typeof e.message === "string" ? redact(e.message, secrets).slice(0, 200) : "";
  const suffix = providerCode !== null ? ` (provider code ${providerCode})` : "";
  const withDetail = (base: string) => `${base}${suffix}${detail ? `: ${detail}` : "."}`;

  if (status !== null) {
    if (status === 401 || status === 403) {
      return new DeliveryError("DELIVERY_AUTH", withDetail("The messaging provider rejected the configured credentials"), false);
    }
    if (status === 429 || providerCode === 20429) {
      return new DeliveryError("DELIVERY_RATE_LIMITED", withDetail("The messaging provider is rate limiting requests"), true);
    }
    if (status >= 500) {
      return new DeliveryError("DELIVERY_PROVIDER_ERROR", withDetail("The messaging provider had a server error"), true);
    }
    return new DeliveryError(
      "DELIVERY_REJECTED",
      withDetail("The messaging provider permanently rejected the message (check recipient, template, and sandbox opt-in)"),
      false,
    );
  }
  if (nodeCode && REQUEST_NEVER_SENT.has(nodeCode)) {
    return new DeliveryError("DELIVERY_NETWORK", `Could not reach the messaging provider (${nodeCode}); the message was not submitted.`, true);
  }
  const name = typeof e.name === "string" ? e.name : "";
  const timedOut =
    (nodeCode !== null && TIMED_OUT.has(nodeCode)) || name === "TimeoutError" || name === "AbortError" || /timeout|timed out/i.test(detail);
  return new DeliveryError(
    "DELIVERY_UNCERTAIN",
    timedOut
      ? "The messaging provider did not answer in time. The message may or may not have been accepted; it will not be resent automatically."
      : "The provider response could not be interpreted. The message may or may not have been accepted; it will not be resent automatically.",
    false,
  );
}
