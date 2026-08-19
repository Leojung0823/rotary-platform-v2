export const BLESSING_IOU_TEXT_MAX_CODE_POINTS = 1000;
export const BLESSING_IOU_DELETE_REASON_MAX_CODE_POINTS = 300;
export const BLESSING_IOU_CURSOR_MAX_LENGTH = 512;
export const BLESSING_IOU_REQUEST_MAX_BYTES = 8192;
export const BLESSING_IOU_MAX_AMOUNT = 9_999_999_999;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/u;

type CursorPayload = Readonly<{ v: 1; created_at: string; id: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

export function blessingTextLength(value: string) {
  return Array.from(value).length;
}

export function normalizeBlessingText(value: unknown) {
  if (typeof value !== "string") throw new Error("invalid_blessing_text");
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  const length = blessingTextLength(normalized);
  if (length < 1 || length > BLESSING_IOU_TEXT_MAX_CODE_POINTS) {
    throw new Error("invalid_blessing_text");
  }
  return normalized;
}

export function parsePledgedAmount(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 1
    || value > BLESSING_IOU_MAX_AMOUNT) {
    throw new Error("invalid_pledged_amount");
  }
  return value;
}

export function parseBlessingEntryBody(value: unknown) {
  if (!isRecord(value)
    || !hasExactKeys(value, ["blessingText", "hideAmount", "pledgedAmount"])
    || typeof value.hideAmount !== "boolean") {
    throw new Error("invalid_blessing_entry_body");
  }
  return {
    blessingText: normalizeBlessingText(value.blessingText),
    pledgedAmount: parsePledgedAmount(value.pledgedAmount),
    hideAmount: value.hideAmount,
  };
}

export function parseBlessingDeleteBody(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, ["reason"])) {
    throw new Error("invalid_blessing_delete_body");
  }
  if (value.reason === null) return { reason: null };
  if (typeof value.reason !== "string") throw new Error("invalid_blessing_delete_body");
  const reason = value.reason.trim();
  const length = blessingTextLength(reason);
  if (length < 2 || length > BLESSING_IOU_DELETE_REASON_MAX_CODE_POINTS) {
    throw new Error("invalid_blessing_delete_body");
  }
  return { reason };
}

export function parseBlessingSettingBody(value: unknown) {
  if (!isRecord(value)
    || !hasExactKeys(value, ["allowPublicAmounts"])
    || typeof value.allowPublicAmounts !== "boolean") {
    throw new Error("invalid_blessing_setting_body");
  }
  return { allowPublicAmounts: value.allowPublicAmounts };
}

function parseUuid(value: string, errorCode: string) {
  if (!uuidPattern.test(value)) throw new Error(errorCode);
  return value.toLowerCase();
}

export function parseBlessingClubId(value: string | null) {
  if (!value) throw new Error("invalid_blessing_club_id");
  return parseUuid(value, "invalid_blessing_club_id");
}

export function parseBlessingEntryId(value: string) {
  return parseUuid(value, "invalid_blessing_entry_id");
}

export function parseBlessingLimit(value: string | null) {
  if (value === null || value === "") return 20;
  if (!/^\d+$/u.test(value)) throw new Error("invalid_blessing_limit");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error("invalid_blessing_limit");
  }
  return parsed;
}

function parseCursorPayload(value: unknown): CursorPayload {
  if (!isRecord(value)
    || !hasExactKeys(value, ["created_at", "id", "v"])
    || value.v !== 1
    || typeof value.created_at !== "string"
    || typeof value.id !== "string") {
    throw new Error("invalid_blessing_cursor");
  }
  const timestamp = new Date(value.created_at);
  if (Number.isNaN(timestamp.getTime()) || !uuidPattern.test(value.id)) {
    throw new Error("invalid_blessing_cursor");
  }
  return { v: 1, created_at: timestamp.toISOString(), id: value.id.toLowerCase() };
}

export function encodeBlessingCursor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return Buffer.from(JSON.stringify(parseCursorPayload(value)), "utf8").toString("base64url");
}

export function decodeBlessingCursor(value: string | null) {
  if (value === null || value === "") return null;
  if (value.length > BLESSING_IOU_CURSOR_MAX_LENGTH || !base64UrlPattern.test(value)) {
    throw new Error("invalid_blessing_cursor");
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(value, "base64url");
  } catch {
    throw new Error("invalid_blessing_cursor");
  }
  if (decoded.toString("base64url") !== value) throw new Error("invalid_blessing_cursor");
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new Error("invalid_blessing_cursor");
  }
  const payload = parseCursorPayload(parsed);
  return { createdAt: payload.created_at, id: payload.id };
}

export function isBlessingJsonContentType(value: string | null) {
  return value?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function trustedOrigin(value: string, production: boolean) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)
      || url.username
      || url.password
      || (production && url.protocol !== "https:")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isSameOriginBlessingMutation({
  requestOrigin,
  origin,
  fetchSite,
  configuredSiteUrl,
  production = process.env.NODE_ENV === "production",
}: {
  requestOrigin: string;
  origin: string | null;
  fetchSite: string | null;
  configuredSiteUrl?: string;
  production?: boolean;
}) {
  const expected = configuredSiteUrl
    ? trustedOrigin(configuredSiteUrl, production)
    : trustedOrigin(requestOrigin, production);
  const supplied = origin ? trustedOrigin(origin, production) : null;
  if (!expected || !supplied || expected !== supplied) return false;
  return fetchSite === null || fetchSite === "same-origin" || fetchSite === "same-site";
}
