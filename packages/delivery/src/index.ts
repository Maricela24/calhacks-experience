// FOUNDATION STUB — owned by Person 3. Replace this file's contents (keep the exports).
// Outbox returns an explicitly simulated result. Live WhatsApp is always blocked here.
import type { DeliveryInput, DeliveryResult } from "@afterhours/contracts";

export type { DeliveryInput, DeliveryResult };

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

export function composeNotification(input: DeliveryInput): string {
  const n = input.tasks.length;
  const first = input.tasks[0];
  if (n === 1 && first) {
    return `Ready for review: "${first.title}" (${first.artifactCount} file${first.artifactCount === 1 ? "" : "s"}). ${input.publicAppUrl}/tasks/${first.id}`;
  }
  return `${n} results ready for review. ${input.publicAppUrl}/`;
}

export async function sendNotification(input: DeliveryInput): Promise<DeliveryResult> {
  if (input.channel === "outbox") {
    return { state: "simulated", message: composeNotification(input), providerMessageId: null, reason: null };
  }
  return {
    state: "blocked",
    message: composeNotification(input),
    providerMessageId: null,
    reason: "Live WhatsApp delivery is not implemented in the foundation stub.",
  };
}
