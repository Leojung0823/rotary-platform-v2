import { CURSOR_MAX_LENGTH, decodeCursor, encodeCursor } from "@/lib/api/cursor";

export const BOARD_CONTENT_MAX_CODE_POINTS = 1000;
export const BOARD_CURSOR_MAX_LENGTH = CURSOR_MAX_LENGTH;
export const BOARD_REQUEST_MAX_BYTES = 4096;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function encodeBoardCursor(value: unknown): string | null {
  return encodeCursor(value, "created_at");
}

export function decodeBoardCursor(value: string | null): DecodedBoardCursor | null {
  const decoded = decodeCursor(value, "created_at");
  return decoded && { createdAt: decoded.timestamp, id: decoded.id };
}

// Moved to the shared API module once a second feature needed them; still
// exported here so the board's callers and tests keep one import.
export { isJsonContentType, isSameOriginMutation } from "@/lib/api/json-request";
