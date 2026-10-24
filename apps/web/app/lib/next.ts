/**
 * Where to go after sign-in. Only a same-origin relative path is accepted: it must start with a single "/" and must not
 * be protocol-relative ("//host"), contain a backslash, or carry a scheme. Anything else falls back to the queue, so a
 * crafted link can never bounce a signed-in user to another site.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || raw.length > 500) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return "/";
  if (raw.startsWith("/login")) return "/";
  try {
    const u = new URL(raw, "http://local.invalid");
    if (u.origin !== "http://local.invalid") return "/";
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}

export const loginUrlFor = (path: string, search: string): string =>
  path === "/" || path.startsWith("/login") ? "/login" : `/login?next=${encodeURIComponent(path + search)}`;
