import type { NextRequest } from "next/server";

// The request-shaped half of an authenticated JSON endpoint: how much body we
// are willing to read, what content type we accept, and whether a mutation
// actually came from our own pages. None of it is specific to one feature, so
// the board and the message centre answer these questions the same way rather
// than each keeping its own copy of the rules.

export function isJsonContentType(value: string | null) {
  return value?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function trustedOrigin(value: string, production: boolean) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
      || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    if (production && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isSameOriginMutation(input: {
  requestOrigin: string;
  origin: string | null;
  fetchSite: string | null;
  configuredSiteUrl?: string;
}) {
  const production = process.env.APP_ENV === "production" || process.env.NODE_ENV === "production";
  const configured = input.configuredSiteUrl?.trim();
  const expectedOrigin = configured
    ? trustedOrigin(configured, production)
    : production
      ? null
      : trustedOrigin(input.requestOrigin, false);

  if (!expectedOrigin || !input.origin) return false;

  let suppliedOrigin: string;
  try {
    suppliedOrigin = new URL(input.origin).origin;
  } catch {
    return false;
  }

  if (suppliedOrigin !== expectedOrigin) return false;
  return !input.fetchSite || input.fetchSite === "same-origin";
}

/**
 * Reads the body with a hard ceiling, checking the declared length first and
 * then the bytes as they arrive -- a Content-Length header is a claim, not a
 * limit. Decoding is strict, so malformed UTF-8 is rejected rather than
 * silently replaced.
 */
export async function readBoundedText(request: NextRequest, maxBytes: number) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    throw new Error("request_too_large");
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("request_too_large").catch(() => undefined);
        throw new Error("request_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("invalid_encoding");
  }
}

export async function readBoundedJson(request: NextRequest, maxBytes: number): Promise<unknown> {
  if (!isJsonContentType(request.headers.get("content-type"))) throw new Error("invalid_content_type");
  const text = await readBoundedText(request, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("invalid_json");
  }
}

export async function hasEmptyBody(request: NextRequest, maxBytes: number) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && declaredLength !== "0") return false;
  return (await readBoundedText(request, maxBytes)).length === 0;
}
