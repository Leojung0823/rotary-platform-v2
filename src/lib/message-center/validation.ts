import { decodeCursor, encodeCursor } from "@/lib/api/cursor";

export const MESSAGE_TITLE_MAX_CODE_POINTS = 120;
export const MESSAGE_BODY_MAX_CODE_POINTS = 4000;

// A club's tag list and roster are both small; a longer array is a malformed
// or probing request, not a real audience.
const MAX_AUDIENCE_ENTRIES = 200;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codePointLength(value: string) {
  return Array.from(value).length;
}

export function normalizeMessageTitle(value: unknown) {
  if (typeof value !== "string") throw new Error("invalid_title");
  // A title is one line: newlines pasted in from elsewhere become spaces
  // rather than a title that renders as three lines in a list.
  const normalized = value.replace(/\s+/gu, " ").trim();
  const length = codePointLength(normalized);
  if (length < 1 || length > MESSAGE_TITLE_MAX_CODE_POINTS) throw new Error("invalid_title");
  return normalized;
}

export function normalizeMessageBody(value: unknown) {
  if (typeof value !== "string") throw new Error("invalid_body");
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  const length = codePointLength(normalized);
  if (length < 1 || length > MESSAGE_BODY_MAX_CODE_POINTS) throw new Error("invalid_body");
  return normalized;
}

function parseUuidList(value: unknown) {
  if (value !== undefined && !Array.isArray(value)) throw new Error("invalid_body");
  const ids = Array.from(new Set((value ?? []) as unknown[]))
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""));
  if (ids.length > MAX_AUDIENCE_ENTRIES || ids.some((id) => !uuidPattern.test(id))) {
    throw new Error("invalid_body");
  }
  return ids.map((id) => id.toLowerCase());
}

/**
 * Tags and named members are mutually exclusive, the same way the database
 * refuses the pair: a message that went to both would have two different
 * answers to "who was this addressed to".
 */
export function parseMessageCreateBody(value: unknown) {
  if (!isPlainRecord(value)) throw new Error("invalid_body");
  const allowed = ["title", "body", "tagIds", "membershipIds"];
  const keys = Object.keys(value);
  if (!keys.every((key) => allowed.includes(key))) throw new Error("invalid_body");
  if (!keys.includes("title") || !keys.includes("body")) throw new Error("invalid_body");

  const tagIds = parseUuidList(value.tagIds);
  const membershipIds = parseUuidList(value.membershipIds);
  if (tagIds.length > 0 && membershipIds.length > 0) throw new Error("invalid_body");

  return {
    title: normalizeMessageTitle(value.title),
    body: normalizeMessageBody(value.body),
    tagIds,
    membershipIds,
  };
}

export function parseMessageLimit(value: string | null) {
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

export function parseMessageClubId(value: string | null) {
  if (!value) throw new Error("invalid_club_id");
  return parseUuid(value, "invalid_club_id");
}

export function parseMessageId(value: string) {
  return parseUuid(value, "invalid_message_id");
}

export function encodeMessageCursor(value: unknown) {
  return encodeCursor(value, "published_at");
}

export function decodeMessageCursor(value: string | null) {
  return decodeCursor(value, "published_at");
}
