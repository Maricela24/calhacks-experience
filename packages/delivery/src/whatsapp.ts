import twilio from "twilio";
import type { DeliveryInput, DeliveryResult } from "@afterhours/contracts";
import { DeliveryError, mapProviderError } from "./errors";
import { appBase, composeNotification, reviewUrl } from "./compose";

/** The only provider surface this package uses; tests inject a fake. */
export interface MessagingClient {
  messages: {
    create(params: {
      from: string;
      to: string;
      body?: string;
      contentSid?: string;
      contentVariables?: string;
    }): Promise<{ sid?: string | null; status?: string | null }>;
  };
}

export interface DeliveryDeps {
  /** Defaults to process.env, read at call time. */
  env?: Record<string, string | undefined>;
  createClient?: (accountSid: string, authToken: string, options: { timeoutMs: number }) => MessagingClient;
}

export const PROVIDER_TIMEOUT_MS = 20_000;

const E164 = /^\+[1-9]\d{6,14}$/;
const CONTENT_SID = /^HX[0-9a-fA-F]{32}$/;

function defaultClient(accountSid: string, authToken: string, options: { timeoutMs: number }): MessagingClient {
  // Retries are disabled in the SDK: the worker owns retry policy, so there is exactly one layer.
  return twilio(accountSid, authToken, { timeout: options.timeoutMs, autoRetry: false, maxRetries: 0 }) as unknown as MessagingClient;
}

/** Accepts "+15551234567" or "whatsapp:+15551234567"; returns the provider form or null. */
export function toWhatsAppAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const bare = value.trim().replace(/^whatsapp:/i, "").replace(/[\s().-]/g, "");
  return E164.test(bare) ? `whatsapp:${bare}` : null;
}

const blocked = (input: DeliveryInput, reason: string): DeliveryResult => ({
  state: "blocked",
  message: safeCompose(input),
  providerMessageId: null,
  reason,
});

function safeCompose(input: DeliveryInput): string {
  try {
    return composeNotification(input);
  } catch {
    return "Notification text could not be composed.";
  }
}

export async function sendWhatsApp(input: DeliveryInput, deps: DeliveryDeps = {}): Promise<DeliveryResult> {
  const env = deps.env ?? process.env;
  const policy = input.deliveryPolicy;

  if (!policy.eligible) {
    return blocked(
      input,
      "Live WhatsApp is disabled: WHATSAPP_USE_CASE_ELIGIBLE is not true. Confirm the provider permits this use case, then set it. The result is still in the dashboard.",
    );
  }
  try {
    appBase(input.publicAppUrl);
  } catch (err) {
    return blocked(input, err instanceof Error ? err.message : "PUBLIC_APP_URL is invalid.");
  }
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const missing = [
    !accountSid && "TWILIO_ACCOUNT_SID",
    !authToken && "TWILIO_AUTH_TOKEN",
    !env.TWILIO_WHATSAPP_FROM?.trim() && "TWILIO_WHATSAPP_FROM",
  ].filter(Boolean);
  if (missing.length > 0 || !accountSid || !authToken) {
    return blocked(input, `WhatsApp is not configured: missing ${missing.join(", ")}.`);
  }
  const from = toWhatsAppAddress(env.TWILIO_WHATSAPP_FROM);
  if (!from) return blocked(input, "TWILIO_WHATSAPP_FROM is not a valid E.164 number (for example +14155238886).");
  if (!input.recipient?.trim()) return blocked(input, "No notification recipient is configured.");
  const to = toWhatsAppAddress(input.recipient);
  if (!to) return blocked(input, "The notification recipient is not a valid E.164 phone number (for example +15551234567).");

  let params: Parameters<MessagingClient["messages"]["create"]>[0];
  let sentMessage: string;
  if (policy.customerServiceWindowOpen) {
    sentMessage = composeNotification(input);
    params = { from, to, body: sentMessage };
  } else {
    const sid = policy.approvedContentSid?.trim();
    if (!sid || !CONTENT_SID.test(sid)) {
      return blocked(
        input,
        "The customer-service window is closed and no approved template (TWILIO_CONTENT_SID) is configured, so nothing was sent.",
      );
    }
    // Template contract: {{1}} = number of tasks, {{2}} = review URL. Must match the approved template exactly.
    const variables = { "1": String(input.tasks.length), "2": reviewUrl(input) };
    sentMessage = `Approved template message (variables 1=${variables["1"]}, 2=${variables["2"]})`;
    params = { from, to, contentSid: sid, contentVariables: JSON.stringify(variables) };
  }

  const secrets = [accountSid, authToken, from, to, input.recipient];
  try {
    const client = (deps.createClient ?? defaultClient)(accountSid, authToken, { timeoutMs: PROVIDER_TIMEOUT_MS });
    const res = await client.messages.create(params);
    if (res.status === "failed" || res.status === "undelivered" || res.status === "canceled") {
      throw new DeliveryError("DELIVERY_REJECTED", `The provider reported the message as ${res.status} immediately.`, false);
    }
    if (!res.sid) {
      throw new DeliveryError("DELIVERY_UNCERTAIN", "The provider returned no message identifier. The message may have been accepted; it will not be resent automatically.", false);
    }
    // Provider acceptance only. Delivery is never claimed without a validated status callback.
    return { state: "accepted", message: sentMessage, providerMessageId: res.sid, reason: null };
  } catch (err) {
    throw mapProviderError(err, secrets);
  }
}
