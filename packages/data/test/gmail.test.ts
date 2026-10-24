import { describe, expect, it } from "vitest";
import {
  getGmailCheckpoint, htmlToText, parseAddress, parseGmailPayload, patchSettings, pollGmailOnce,
  saveGmailConnection, type GmailApi, type GmailMessage, type GmailPart,
} from "../src";
import { makeTestDb } from "../src/testing";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

describe("MIME normalization", () => {
  it("prefers text/plain inside nested multipart and collects real attachments", () => {
    const payload: GmailPart = {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "multipart/alternative", parts: [
          { partId: "0.0", mimeType: "text/plain", body: { data: b64("Hello – plain body ✓") } },
          { partId: "0.1", mimeType: "text/html", body: { data: b64("<p>HTML body</p>") } },
        ] },
        { partId: "1", mimeType: "text/csv", filename: "sales.csv", body: { attachmentId: "ATT1", size: 42 } },
        { partId: "2", mimeType: "text/markdown", filename: "brief.md", body: { data: b64("# Brief"), size: 7 } },
      ],
    };
    const r = parseGmailPayload(payload);
    expect(r.text).toBe("Hello – plain body ✓");
    expect(r.attachments.map((a) => [a.id, a.filename, a.attachmentId])).toEqual([
      ["att-1", "sales.csv", "ATT1"],
      ["att-2", "brief.md", null],
    ]);
    expect(r.attachments[1]!.inlineData?.toString()).toBe("# Brief");
  });

  it("falls back to sanitized HTML without fetching images, scripts, or links", () => {
    const html = '<html><head><style>p{}</style><script>alert(1)</script></head><body><p>Hi &amp; welcome</p><img src="https://tracker.test/x.png"><a href="https://evil.test">click</a><br>Line&nbsp;2</body></html>';
    const r = parseGmailPayload({ mimeType: "text/html", body: { data: b64(html) } });
    expect(r.text).toBe("Hi & welcome\nclick\nLine 2");
    expect(r.text).not.toMatch(/alert|tracker|evil\.test/);
    expect(htmlToText("<li>a</li><li>b</li>")).toBe("- a\n- b");
  });

  it("parses addresses", () => {
    expect(parseAddress('"Jordan Lee" <Jordan@Client.Example>')).toEqual({ name: "Jordan Lee", email: "jordan@client.example" });
    expect(parseAddress("a@b.co")).toEqual({ name: null, email: "a@b.co" });
    expect(parseAddress("not an address")).toBeNull();
  });
});

function fakeGmail(messages: GmailMessage[], opts: { failGet?: string } = {}) {
  const calls = { list: [] as string[], get: [] as string[], att: 0 };
  const api: GmailApi = {
    async getProfileEmail() { return "inbox@test.dev"; },
    async listInbox(q) {
      calls.list.push(q);
      return { ids: [...messages].sort((a, b) => Number(b.internalDate) - Number(a.internalDate)).map((m) => m.id), nextPageToken: null };
    },
    async getMessage(id) {
      calls.get.push(id);
      if (id === opts.failGet) throw new Error("socket hang up");
      return messages.find((m) => m.id === id)!;
    },
    async getAttachment() { calls.att++; return Buffer.from("month,revenue\n2025-01,1\n"); },
  };
  return { api, calls };
}

const msg = (id: string, ms: number, from: string, attach = false): GmailMessage => ({
  id, threadId: `t-${id}`, internalDate: String(ms), labelIds: ["INBOX"],
  payload: {
    mimeType: "multipart/mixed",
    headers: [{ name: "From", value: from }, { name: "To", value: "inbox@test.dev" }, { name: "Subject", value: `Req ${id}` }],
    parts: [
      { partId: "0", mimeType: "text/plain", body: { data: b64("Please prepare a report.") } },
      ...(attach ? [{ partId: "1", mimeType: "text/csv", filename: "s.csv", body: { attachmentId: "A", size: 24 } }] : []),
    ],
  },
});

describe("gmail polling", () => {
  it("ingests only new allowed messages, skips history, and is idempotent across overlap", async () => {
    const { db, config } = makeTestDb();
    const connected = new Date("2026-03-02T20:00:00Z");
    saveGmailConnection(db, config.tokenEncryptionKey, { account: "inbox@test.dev", tokens: { refresh_token: "r" } }, connected);
    patchSettings(db, { allowedSenders: ["boss@client.test"] }, connected);
    const t = connected.getTime();
    const messages = [
      msg("old", t - 3600_000, "boss@client.test"),             // before connect: never processed
      msg("m1", t + 10_000, "Boss <boss@client.test>", true),   // allowed, with attachment
      msg("m2", t + 20_000, "spam@elsewhere.test", true),        // unknown sender: no download, no task
    ];
    const { api, calls } = fakeGmail(messages);
    const deps = { db, config, now: () => new Date(t + 30_000), makeApi: () => api };
    const r1 = await pollGmailOnce(deps);
    expect(r1).toMatchObject({ status: "ok", ingested: 1, ignored: 1 });
    expect(calls.att).toBe(1); // only the allowed sender's attachment was downloaded
    expect(calls.list[0]).toMatch(/^in:inbox after:\d+$/);

    const r2 = await pollGmailOnce(deps); // overlap window lists the same IDs again
    expect(r2).toMatchObject({ status: "ok", ingested: 0, ignored: 0 });
    expect((db.prepare("SELECT COUNT(*) n FROM tasks").get() as { n: number }).n).toBe(1);
    const task = db.prepare("SELECT ingestion_mode, sender_email FROM tasks").get();
    expect(task).toEqual({ ingestion_mode: "gmail", sender_email: "boss@client.test" });
    expect(getGmailCheckpoint(db).afterMs).toBe(t + 20_000);
  });

  it("does not advance past a message it failed to fetch", async () => {
    const { db, config } = makeTestDb();
    const connected = new Date("2026-03-02T20:00:00Z");
    saveGmailConnection(db, config.tokenEncryptionKey, { account: "inbox@test.dev", tokens: { refresh_token: "r" } }, connected);
    patchSettings(db, { allowedSenders: ["boss@client.test"] }, connected);
    const t = connected.getTime();
    const messages = [msg("a", t + 1000, "boss@client.test"), msg("b", t + 2000, "boss@client.test")];
    const failing = fakeGmail(messages, { failGet: "b" });
    const r = await pollGmailOnce({ db, config, now: () => new Date(t + 5000), makeApi: () => failing.api });
    expect(r.status).toBe("error");
    expect(getGmailCheckpoint(db).afterMs).toBe(t); // unchanged
    const ok = fakeGmail(messages);
    const r2 = await pollGmailOnce({ db, config, now: () => new Date(t + 20_000), makeApi: () => ok.api });
    expect(r2).toMatchObject({ status: "ok", ingested: 2 });
    const st = db.prepare("SELECT state, last_error FROM integrations").get();
    expect(st).toEqual({ state: "connected", last_error: null });
  });

  it("reports revoked credentials with reconnect guidance and keeps history", async () => {
    const { db, config } = makeTestDb();
    saveGmailConnection(db, config.tokenEncryptionKey, { account: "inbox@test.dev", tokens: { refresh_token: "r" } }, new Date());
    const api: GmailApi = {
      getProfileEmail: async () => "x", getMessage: async () => { throw new Error(); }, getAttachment: async () => Buffer.alloc(0),
      listInbox: async () => { throw new Error("invalid_grant: Token has been expired or revoked."); },
    };
    const r = await pollGmailOnce({ db, config, now: () => new Date(), makeApi: () => api });
    expect(r.status).toBe("error");
    expect(r.error).toMatch(/Reconnect Gmail/);
    expect(r.error).not.toMatch(/invalid_grant/);
  });

  it("does nothing while disconnected", async () => {
    const { db, config } = makeTestDb();
    const r = await pollGmailOnce({ db, config, now: () => new Date(), makeApi: () => { throw new Error("should not build"); } });
    expect(r.status).toBe("disconnected");
  });
});
