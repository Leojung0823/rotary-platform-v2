// Keyset pagination cursors.
//
// A cursor is the (timestamp, id) pair of the last row on a page, encoded so
// it survives a round trip through a query string. It is parsed on the way out
// as strictly as on the way in: a cursor is a client-supplied value that goes
// straight into a database predicate, so an unrecognised shape is rejected
// rather than coerced.

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

export const CURSOR_MAX_LENGTH = 512;

export type DecodedCursor = {
  timestamp: string;
  id: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseCursorPayload(value: unknown, timestampKey: string) {
  if (!isPlainRecord(value)) throw new Error("invalid_cursor");
  const keys = Object.keys(value).sort();
  const expected = ["id", "v", timestampKey].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error("invalid_cursor");
  }

  const rawTimestamp = value[timestampKey];
  if (value.v !== 1 || typeof rawTimestamp !== "string" || typeof value.id !== "string") {
    throw new Error("invalid_cursor");
  }
  const timestamp = new Date(rawTimestamp);
  if (Number.isNaN(timestamp.getTime()) || !uuidPattern.test(value.id)) throw new Error("invalid_cursor");
  return { v: 1 as const, timestamp: timestamp.toISOString(), id: value.id.toLowerCase() };
}

export function encodeCursor(value: unknown, timestampKey: string): string | null {
  if (value === null || value === undefined) return null;
  const payload = parseCursorPayload(value, timestampKey);
  return Buffer.from(
    JSON.stringify({ v: payload.v, [timestampKey]: payload.timestamp, id: payload.id }),
    "utf8",
  ).toString("base64url");
}

export function decodeCursor(value: string | null, timestampKey: string): DecodedCursor | null {
  if (value === null || value === "") return null;
  if (value.length > CURSOR_MAX_LENGTH || !base64UrlPattern.test(value)) throw new Error("invalid_cursor");

  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    throw new Error("invalid_cursor");
  }

  // base64url has more than one spelling for the same bytes; only the
  // canonical one is accepted, so a cursor has exactly one representation.
  if (decoded.toString("base64url") !== value) throw new Error("invalid_cursor");

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new Error("invalid_cursor");
  }

  const payload = parseCursorPayload(parsed, timestampKey);
  return { timestamp: payload.timestamp, id: payload.id };
}
