// Gmail payload -> readable text + attachment descriptors. Pure; performs no network and
// never fetches remote images or links.
export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string | null; value?: string | null }>;
  body?: { size?: number | null; data?: string | null; attachmentId?: string | null };
  parts?: GmailPart[];
}

export interface AttachmentDescriptor {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  attachmentId: string | null;
  inlineData: Buffer | null;
}

export interface ParsedPayload { text: string; attachments: AttachmentDescriptor[] }

const header = (p: GmailPart, name: string): string | undefined =>
  p.headers?.find((h) => h.name?.toLowerCase() === name)?.value ?? undefined;

export const decodeBase64Url = (s: string): Buffer => Buffer.from(s, "base64url");

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseGmailPayload(payload: GmailPart): ParsedPayload {
  const plain: string[] = [];
  const html: string[] = [];
  const attachments: AttachmentDescriptor[] = [];

  const walk = (p: GmailPart, path: string): void => {
    const mime = (p.mimeType ?? "").toLowerCase();
    const disp = (header(p, "content-disposition") ?? "").toLowerCase();
    const isAttachment = !!p.filename && (p.body?.attachmentId || p.body?.data || disp.startsWith("attachment"));
    if (p.parts?.length) {
      p.parts.forEach((c, i) => walk(c, `${path}.${i}`));
      return;
    }
    if (isAttachment) {
      attachments.push({
        id: `att-${p.partId ?? path}`,
        filename: p.filename!,
        mimeType: mime || "application/octet-stream",
        sizeBytes: p.body?.size ?? (p.body?.data ? decodeBase64Url(p.body.data).byteLength : 0),
        attachmentId: p.body?.attachmentId ?? null,
        inlineData: !p.body?.attachmentId && p.body?.data ? decodeBase64Url(p.body.data) : null,
      });
      return;
    }
    if (mime === "text/plain" && p.body?.data) plain.push(decodeBase64Url(p.body.data).toString("utf8"));
    else if (mime === "text/html" && p.body?.data) html.push(decodeBase64Url(p.body.data).toString("utf8"));
  };
  walk(payload, "0");

  const text = plain.length ? plain.join("\n\n").trim() : html.map(htmlToText).join("\n\n").trim();
  return { text, attachments };
}

export function headerValue(payload: GmailPart, name: string): string | undefined {
  return header(payload, name.toLowerCase());
}

/** Parse `Name <a@b.c>` or bare address. */
export function parseAddress(raw: string | undefined): { name: string | null; email: string } | null {
  if (!raw) return null;
  const m = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<([^<>@\s]+@[^<>\s]+)>\s*$/);
  if (m) return { name: m[1]?.trim() || null, email: m[2]!.toLowerCase() };
  const bare = raw.trim().match(/^[^<>@\s,]+@[^<>@\s,]+$/);
  return bare ? { name: null, email: bare[0].toLowerCase() } : null;
}

export function parseAddressList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => parseAddress(s)?.email).filter((e): e is string => !!e);
}
