import { describe, expect, it, vi } from "vitest";
import type { DeliveryInput } from "@afterhours/contracts";
import {
  DeliveryError, composeNotification, redact, safeTitle, sendNotification, toWhatsAppAddress, type MessagingClient,
} from "../src/index";

const APP = "https://afterhours.example";
const SID = "AC" + "a".repeat(32);
const TOKEN = "super-secret-token-value";
const CONTENT = "HX" + "b".repeat(32);
const ENV = { TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886" };

function input(over: Partial<DeliveryInput> = {}): DeliveryInput {
  return {
    notificationId: "n1",
    channel: "whatsapp",
    recipient: "+15551230000",
    publicAppUrl: APP,
    tasks: [{ id: "task-1", title: "Maple & Moss proposal and deck", revision: 1, artifactCount: 2 }],
    deliveryPolicy: { eligible: true, customerServiceWindowOpen: true, approvedContentSid: null },
    ...over,
  };
}

function fakeClient(impl?: MessagingClient["messages"]["create"]) {
  const create = vi.fn(impl ?? (async () => ({ sid: "SM" + "c".repeat(32), status: "queued" })));
  const createClient = vi.fn(() => ({ messages: { create } }) as MessagingClient);
  return { create, createClient };
}

describe("composeNotification", () => {
  it("single task uses the real title, file count and task link", () => {
    expect(composeNotification(input())).toBe(
      `Ready to review: Maple & Moss proposal and deck.\n2 files prepared. Review: ${APP}/tasks/task-1`,
    );
  });

  it("digest lists actual titles, counts the remainder, and links to the queue", () => {
    const tasks = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, title: `Request ${i}`, revision: 1, artifactCount: 1 }));
    const text = composeNotification(input({ tasks }));
    expect(text).toContain("Good morning. 7 requests are ready for review.");
    expect(text).toContain("• Request 0");
    expect(text).toContain("• Request 4");
    expect(text).not.toContain("Request 5");
    expect(text).toContain("…and 2 more");
    expect(text.endsWith(`Review your queue: ${APP}/`)).toBe(true);
  });

  it("encodes IDs, strips links and control characters from titles, and truncates long titles", () => {
    const text = composeNotification(
      input({ tasks: [{ id: "a/b?c", title: "Check https://evil.example/x now\nline2 " + "x".repeat(200), revision: 1, artifactCount: 1 }] }),
    );
    expect(text).toContain(`${APP}/tasks/a%2Fb%3Fc`);
    expect(text).not.toContain("evil.example");
    expect(text).toContain("[link]");
    expect(text.split("\n")[0]!.length).toBeLessThan(120);
    expect(text).toContain("1 file prepared");
  });

  it("never includes anything but titles, counts and a link", () => {
    expect(safeTitle("   ")).toBe("Untitled request");
    const text = composeNotification(input());
    expect(text).not.toMatch(/password|token|@/i);
  });

  it("rejects an unusable PUBLIC_APP_URL", () => {
    expect(() => composeNotification(input({ publicAppUrl: "javascript:alert(1)" }))).toThrow(DeliveryError);
    expect(() => composeNotification(input({ publicAppUrl: "not a url" }))).toThrow(DeliveryError);
  });
});

describe("outbox channel", () => {
  it("is simulated, carries the exact message, and never touches the provider", async () => {
    const { createClient } = fakeClient();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const out = await sendNotification(input({ channel: "outbox", recipient: null }), { env: ENV, createClient });
    expect(out.state).toBe("simulated");
    expect(out.providerMessageId).toBeNull();
    expect(out.message).toBe(composeNotification(input()));
    expect(createClient).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("whatsapp blocking rules", () => {
  it("blocks when the use case is not marked eligible, even with credentials", async () => {
    const { createClient } = fakeClient();
    const out = await sendNotification(input({ deliveryPolicy: { eligible: false, customerServiceWindowOpen: true, approvedContentSid: CONTENT } }), { env: ENV, createClient });
    expect(out.state).toBe("blocked");
    expect(out.reason).toMatch(/WHATSAPP_USE_CASE_ELIGIBLE/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("blocks and names (not reveals) missing credentials", async () => {
    const { createClient } = fakeClient();
    const out = await sendNotification(input(), { env: {}, createClient });
    expect(out.state).toBe("blocked");
    expect(out.reason).toMatch(/TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("blocks a missing or malformed recipient or sender", async () => {
    const { createClient } = fakeClient();
    expect((await sendNotification(input({ recipient: null }), { env: ENV, createClient })).reason).toMatch(/recipient/);
    expect((await sendNotification(input({ recipient: "555-1234" }), { env: ENV, createClient })).reason).toMatch(/E\.164/);
    const badFrom = await sendNotification(input(), { env: { ...ENV, TWILIO_WHATSAPP_FROM: "nope" }, createClient });
    expect(badFrom.reason).toMatch(/TWILIO_WHATSAPP_FROM/);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("blocks with a closed window and no approved template", async () => {
    const { createClient } = fakeClient();
    const policy = { eligible: true, customerServiceWindowOpen: false, approvedContentSid: null };
    const out = await sendNotification(input({ deliveryPolicy: policy }), { env: ENV, createClient });
    expect(out.state).toBe("blocked");
    expect(out.reason).toMatch(/window is closed/);
    const bad = await sendNotification(input({ deliveryPolicy: { ...policy, approvedContentSid: "not-a-sid" } }), { env: ENV, createClient });
    expect(bad.state).toBe("blocked");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("blocks instead of throwing on an invalid public URL", async () => {
    const { createClient } = fakeClient();
    const out = await sendNotification(input({ publicAppUrl: "ftp://x" }), { env: ENV, createClient });
    expect(out.state).toBe("blocked");
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("whatsapp sending", () => {
  it("open window: sends only the composed message to the configured recipient, with one SDK layer of retries off", async () => {
    const { create, createClient } = fakeClient();
    const out = await sendNotification(input(), { env: ENV, createClient });
    expect(createClient).toHaveBeenCalledWith(SID, TOKEN, { timeoutMs: expect.any(Number) });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      from: "whatsapp:+14155238886",
      to: "whatsapp:+15551230000",
      body: composeNotification(input()),
    });
    expect(out).toMatchObject({ state: "accepted", providerMessageId: "SM" + "c".repeat(32), reason: null });
  });

  it("closed window with template: uses the Content SID and exact variable mapping, with no free-form body", async () => {
    const { create, createClient } = fakeClient();
    const policy = { eligible: true, customerServiceWindowOpen: false, approvedContentSid: CONTENT };
    const out = await sendNotification(input({ deliveryPolicy: policy }), { env: ENV, createClient });
    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0]![0];
    expect(arg.contentSid).toBe(CONTENT);
    expect(arg.body).toBeUndefined();
    expect(JSON.parse(arg.contentVariables!)).toEqual({ "1": "1", "2": `${APP}/tasks/task-1` });
    expect(out.state).toBe("accepted");
  });

  it("provider acceptance is accepted, never delivered", async () => {
    const { createClient } = fakeClient(async () => ({ sid: "SM" + "d".repeat(32), status: "sent" }));
    expect((await sendNotification(input(), { env: ENV, createClient })).state).toBe("accepted");
  });

  it("an immediately failed provider status is a permanent rejection", async () => {
    const { createClient } = fakeClient(async () => ({ sid: "SM" + "e".repeat(32), status: "failed" }));
    await expect(sendNotification(input(), { env: ENV, createClient })).rejects.toMatchObject({ code: "DELIVERY_REJECTED", retryable: false });
  });

  it("a response without a message id is uncertain, not accepted", async () => {
    const { createClient } = fakeClient(async () => ({ sid: null, status: "queued" }));
    await expect(sendNotification(input(), { env: ENV, createClient })).rejects.toMatchObject({ code: "DELIVERY_UNCERTAIN", retryable: false });
  });
});

describe("provider error mapping", () => {
  const fail = (e: unknown) => fakeClient(async () => { throw e; }).createClient;
  const run = (e: unknown) => sendNotification(input(), { env: ENV, createClient: fail(e) });

  it.each([
    [{ status: 401, code: 20003, message: "Authenticate" }, "DELIVERY_AUTH", false],
    [{ status: 429, code: 20429, message: "Too many" }, "DELIVERY_RATE_LIMITED", true],
    [{ status: 503, message: "down" }, "DELIVERY_PROVIDER_ERROR", true],
    [{ status: 400, code: 63016, message: "outside window" }, "DELIVERY_REJECTED", false],
    [{ status: 400, code: 21211, message: "bad To" }, "DELIVERY_REJECTED", false],
    [{ code: "ENOTFOUND", message: "getaddrinfo" }, "DELIVERY_NETWORK", true],
    [{ code: "ECONNREFUSED", message: "refused" }, "DELIVERY_NETWORK", true],
  ])("%j -> %s retryable=%s", async (err, code, retryable) => {
    await expect(run(err)).rejects.toMatchObject({ name: "DeliveryError", code, retryable });
  });

  it("a timeout after submission is DELIVERY_UNCERTAIN and never retryable", async () => {
    for (const err of [{ code: "ECONNABORTED", message: "timeout of 20000ms exceeded" }, { name: "TimeoutError", message: "x" }, new Error("boom")]) {
      await expect(run(err)).rejects.toMatchObject({ code: "DELIVERY_UNCERTAIN", retryable: false });
    }
  });

  it("redacts phone numbers, SIDs, and the auth token from error text", async () => {
    const err = { status: 400, code: 21211, message: `The 'To' number whatsapp:+15551230000 is invalid for ${SID} using ${TOKEN} or +1 (555) 123-0000` };
    const caught = (await run(err).catch((e: unknown) => e)) as DeliveryError;
    expect(caught.message).not.toContain("5551230000");
    expect(caught.message).not.toContain(SID);
    expect(caught.message).not.toContain(TOKEN);
    expect(caught.message).not.toMatch(/555\)? ?123/);
  });
});

describe("helpers", () => {
  it("normalizes WhatsApp addresses and redacts known secrets", () => {
    expect(toWhatsAppAddress("+1 (555) 123-0000")).toBe("whatsapp:+15551230000");
    expect(toWhatsAppAddress("whatsapp:+15551230000")).toBe("whatsapp:+15551230000");
    expect(toWhatsAppAddress("5551230000")).toBeNull();
    expect(redact("key=abcd1234 call +15551230000", ["abcd1234"])).toBe("key=[redacted] call [redacted]");
  });
});
