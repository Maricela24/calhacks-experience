/**
 * Removes characters XML 1.0 (and therefore DOCX/PPTX) cannot contain: C0 controls other than
 * tab/newline/carriage return, DEL/C1 controls, U+FFFE/U+FFFF, and unpaired surrogates.
 */
export function officeText(value: string): string {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { out += value[index]! + value[index + 1]!; index += 1; }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    if (code === 9 || code === 10 || code === 13) { out += value[index]!; continue; }
    if (code < 32 || (code >= 0x7f && code <= 0x9f) || code === 0xfffe || code === 0xffff) continue;
    out += value[index]!;
  }
  return out;
}

/** Shortens at a word boundary and marks the cut; used only for display labels, never for facts. */
export function shorten(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
