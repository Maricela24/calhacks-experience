// Notification composition and provider adapter (Person 3). Server-only: never import this from apps/web.
import type { DeliveryInput, DeliveryResult } from "@afterhours/contracts";
import { composeNotification } from "./compose";
import { DeliveryError } from "./errors";
import { sendWhatsApp, type DeliveryDeps } from "./whatsapp";

export type { DeliveryInput, DeliveryResult };
export { DeliveryError, redact } from "./errors";
export { composeNotification, safeTitle } from "./compose";
export { toWhatsAppAddress, type DeliveryDeps, type MessagingClient } from "./whatsapp";

/**
 * Outbox: composes the exact message and returns `simulated` with no network request.
 * WhatsApp: official Twilio API only; returns `blocked` (never throws) when eligibility, configuration,
 * recipient, window, or template is missing. `accepted` means provider acceptance, not delivery.
 * The optional second argument exists for tests.
 */
export async function sendNotification(input: DeliveryInput, deps?: DeliveryDeps): Promise<DeliveryResult> {
  if (input.channel === "outbox") {
    try {
      return { state: "simulated", message: composeNotification(input), providerMessageId: null, reason: null };
    } catch (err) {
      if (err instanceof DeliveryError && err.code === "DELIVERY_CONFIG") {
        return { state: "blocked", message: "Notification text could not be composed.", providerMessageId: null, reason: err.message };
      }
      throw err;
    }
  }
  return sendWhatsApp(input, deps);
}
