/**
 * A description is written by an organiser in a plain textarea, so a link in it
 * arrives as bare text. Rendering it as text means the member has to select and
 * copy it by hand on a phone, which is where most of them read this.
 *
 * Only http and https become links. A bare "www." or a scheme like javascript:
 * or data: stays text -- turning organiser-typed text into a clickable link is
 * a decision about where a member's tap goes, and it is only made for the two
 * schemes that cannot execute anything.
 */
export type LinkifySegment =
  | Readonly<{ kind: "text"; value: string }>
  | Readonly<{ kind: "link"; value: string; href: string }>;

// Stops before trailing punctuation so "詳見 https://example.com/x。" does not
// swallow the full stop, and balances a trailing ")" only when the URL opened
// one -- Wikipedia-style links really do contain brackets.
const URL_PATTERN = /https?:\/\/[^\s<>"'，。、；：！？）】」』]+/giu;

function trimTrailing(match: string): string {
  let value = match;
  while (value.length > 0) {
    const last = value[value.length - 1];
    if (".,;:!?".includes(last)) {
      value = value.slice(0, -1);
      continue;
    }
    if (last === ")" && (value.match(/\(/gu)?.length ?? 0) < (value.match(/\)/gu)?.length ?? 0)) {
      value = value.slice(0, -1);
      continue;
    }
    break;
  }
  return value;
}

export function linkifySegments(text: string): readonly LinkifySegment[] {
  const segments: LinkifySegment[] = [];
  let index = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const url = trimTrailing(match[0]);
    if (url.length === 0) continue;
    if (start > index) segments.push({ kind: "text", value: text.slice(index, start) });

    // Parsed rather than trusted: a string that starts with "http" can still
    // fail to be a URL, and only a parsed origin decides what is rendered.
    let href: string | null = null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") href = parsed.toString();
    } catch {
      href = null;
    }

    segments.push(href === null ? { kind: "text", value: url } : { kind: "link", value: url, href });
    index = start + url.length;
  }
  if (index < text.length) segments.push({ kind: "text", value: text.slice(index) });
  return segments;
}
