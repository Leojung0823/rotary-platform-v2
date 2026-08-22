export const BOARD_CONTENT_MAX_CODE_POINTS = 1000;
export const BOARD_CURSOR_MAX_LENGTH = 512;
export const BOARD_REQUEST_MAX_BYTES = 4096;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

type CursorPayload = {
  v: 1;
  created_at: string;
  id: string;
};

export type DecodedBoardCursor = {
  createdAt: string;
  id: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}

export function boardContentLength(value: string) {
  return Array.from(value).length;
}

export function normalizeBoardContent(value: unknown) {
  if (typeof value !== "string") throw new Error("invalid_content");
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  const length = boardContentLength(normalized);
  if (length < 1 || length > BOARD_CONTENT_MAX_CODE_POINTS) throw new Error("invalid_content");
  return normalized;
}

export function parseBoardContentBody(value: unknown) {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["content"])) throw new Error("invalid_body");
  return { content: normalizeBoardContent(value.content) };
}

// A club's tag list is small; a longer array is a malformed or probing request.
const MAX_AUDIENCE_TAGS = 50;

/**
 * Creating a post may carry an audience; editing one may not. They are
 * separate parsers so an edit cannot quietly change who a post was sent to
 * after people have already read it.
 */
export function parseBoardCreateBody(value: unknown) {
  if (!isPlainRecord(value)) throw new Error("invalid_body");
  const keys = Object.keys(value);
  if (!keys.every((key) => key === "content" || key === "tagIds")) throw new Error("invalid_body");
  if (!keys.includes("content")) throw new Error("invalid_body");

  const raw = value.tagIds;
  if (raw !== undefined && !Array.isArray(raw)) throw new Error("invalid_body");
  const tagIds = Array.from(new Set((raw ?? []) as unknown[]))
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""));
  if (tagIds.length > MAX_AUDIENCE_TAGS || tagIds.some((id) => !uuidPattern.test(id))) {
    throw new Error("invalid_body");
  }

  return { content: normalizeBoardContent(value.content), tagIds };
}

export function parseBoardLimit(value: string | null) {
  if (value === null || value === "") return 20;
  if (!/^\d+$/.test(value)) throw new Error("invalid_limit");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) throw new Error("invalid_limit");
  return parsed;
}

function parseUuid(value: string, errorCode: string) {
  if (!uuidPattern.test(value)) throw new Error(errorCode);
  return value.toLowerCase();
}

export function parseBoardClubId(value: string | null) {
  if (!value) throw new Error("invalid_club_id");
  return parseUuid(value, "invalid_club_id");
}

export function parseBoardPostId(value: string) {
  return parseUuid(value, "invalid_post_id");
}

function parseCursorPayload(value: unknown): CursorPayload {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["created_at", "id", "v"])) {
    throw new Error("invalid_cursor");
  }
  if (value.v !== 1 || typeof value.created_at !== "string" || typeof value.id !== "string") {
    throw new Error("invalid_cursor");
  }
  const timestamp = new Date(value.created_at);
  if (Number.isNaN(timestamp.getTime()) || !uuidPattern.test(value.id)) throw new Error("invalid_cursor");
  return { v: 1, created_at: timestamp.toISOString(), id: value.id.toLowerCase() };
}

export function encodeBoardCursor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const payload = parseCursorPayload(value);
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeBoardCursor(value: string | null): DecodedBoardCursor | null {
  if (value === null || value === "") return null;
  if (value.length > BOARD_CURSOR_MAX_LENGTH || !base64UrlPattern.test(value)) throw new Error("invalid_cursor");

  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    throw new Error("invalid_cursor");
  }

  if (decoded.toString("base64url") !== value) throw new Error("invalid_cursor");

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new Error("invalid_cursor");
  }

  const payload = parseCursorPayload(parsed);
  return { createdAt: payload.created_at, id: payload.id };
}

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
