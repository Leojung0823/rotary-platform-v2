export const DYNAMIC_QR_CREDENTIAL_TTL_SECONDS = 60;
export const DYNAMIC_QR_ROTATION_INTERVAL_MS = 20_000;
export const DYNAMIC_QR_MAX_OVERLAP_SECONDS = 30;

export type DynamicCredentialProjection = Readonly<{
  credential: string;
  credentialPrefix: string;
  expiresAt: string;
  serverNow: string;
}>;

export type DynamicCheckinResult = Readonly<{
  attendanceId: string;
  eventId: string;
  checkedInAt: string;
  idempotent: boolean;
}>;

const credentialPattern = /^[0-9a-f]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseDynamicCredentialProjection(value: unknown): DynamicCredentialProjection | null {
  if (!isRecord(value)
    || typeof value.credential !== "string"
    || !credentialPattern.test(value.credential)
    || typeof value.credential_prefix !== "string"
    || value.credential_prefix.length !== 8
    || typeof value.expires_at !== "string"
    || typeof value.server_now !== "string") {
    return null;
  }

  return {
    credential: value.credential,
    credentialPrefix: value.credential_prefix,
    expiresAt: value.expires_at,
    serverNow: value.server_now,
  };
}

export function parseDynamicCheckinResult(value: unknown): DynamicCheckinResult | null {
  if (!isRecord(value)
    || typeof value.attendance_id !== "string"
    || typeof value.event_id !== "string"
    || typeof value.checked_in_at !== "string"
    || typeof value.idempotent !== "boolean") {
    return null;
  }
  return {
    attendanceId: value.attendance_id,
    eventId: value.event_id,
    checkedInAt: value.checked_in_at,
    idempotent: value.idempotent,
  };
}

export type CheckinSafeErrorCode =
  | "invalid_input"
  | "forbidden"
  | "not_eligible"
  | "window_closed"
  | "already_open"
  | "not_open"
  | "legacy_session_active"
  | "invalid_token"
  | "expired"
  | "session_closed"
  | "not_found"
  | "out_of_range"
  | "venue_missing"
  | "temporary";

export function mapCheckinSafeError(message: string | undefined): CheckinSafeErrorCode {
  if (message?.includes("attendance_manage_required") || message?.includes("active_membership_required") || message?.includes("active_account_required")) return "forbidden";
  if (message?.includes("event_not_checkin_eligible")) return "not_eligible";
  if (message?.includes("checkin_window_closed")) return "window_closed";
  if (message?.includes("checkin_session_already_active")) return "already_open";
  if (message?.includes("legacy_checkin_session_active")) return "legacy_session_active";
  if (message?.includes("checkin_session_not_active")) return "session_closed";
  if (message?.includes("checkin_token_invalid_or_expired") || message?.includes("invalid_checkin_token")) return "expired";
  if (message?.includes("attendance_not_available")) return "not_found";
  // Deliberately collapses to a single code: the caller is told it is not at
  // the venue, never how far away it is.
  if (message?.includes("checkin_location_out_of_range")) return "out_of_range";
  if (message?.includes("event_venue_location_missing")) return "venue_missing";
  if (message?.includes("invalid_checkin") || message?.includes("reason_required")) return "invalid_input";
  return "temporary";
}

export function dynamicCredentialIsUsable(expiresAt: string, now = Date.now()) {
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs > now;
}
