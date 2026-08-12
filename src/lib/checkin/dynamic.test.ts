import { describe, expect, it } from "vitest";
import {
  DYNAMIC_QR_CREDENTIAL_TTL_SECONDS,
  DYNAMIC_QR_MAX_OVERLAP_SECONDS,
  DYNAMIC_QR_ROTATION_INTERVAL_MS,
  dynamicCredentialIsUsable,
  mapCheckinSafeError,
  parseDynamicCheckinResult,
  parseDynamicCredentialProjection,
} from "./dynamic";

describe("dynamic QR check-in projections", () => {
  it("accepts the bounded manager credential response without accepting malformed data", () => {
    const value = parseDynamicCredentialProjection({
      credential: "a".repeat(64), credential_prefix: "aaaaaaaa", expires_at: "2026-08-12T00:01:00.000Z", server_now: "2026-08-12T00:00:00.000Z",
    });
    expect(value).toEqual({ credential: "a".repeat(64), credentialPrefix: "aaaaaaaa", expiresAt: "2026-08-12T00:01:00.000Z", serverNow: "2026-08-12T00:00:00.000Z" });
    expect(parseDynamicCredentialProjection({ credential: "a".repeat(63) })).toBeNull();
  });

  it("parses only complete member check-in results", () => {
    expect(parseDynamicCheckinResult({ attendance_id: "a", event_id: "b", checked_in_at: "2026-08-12T00:00:00.000Z", idempotent: false })).toMatchObject({ idempotent: false });
    expect(parseDynamicCheckinResult({ attendance_id: "a", event_id: "b", idempotent: false })).toBeNull();
  });

  it("uses server-aligned bounded rotation policy constants", () => {
    expect(DYNAMIC_QR_CREDENTIAL_TTL_SECONDS).toBe(60);
    expect(DYNAMIC_QR_ROTATION_INTERVAL_MS).toBeLessThan(DYNAMIC_QR_CREDENTIAL_TTL_SECONDS * 1_000);
    expect(DYNAMIC_QR_MAX_OVERLAP_SECONDS).toBeLessThanOrEqual(30);
    expect(dynamicCredentialIsUsable("2026-08-12T00:00:01.000Z", Date.parse("2026-08-12T00:00:00.000Z"))).toBe(true);
    expect(dynamicCredentialIsUsable("2026-08-12T00:00:00.000Z", Date.parse("2026-08-12T00:00:00.000Z"))).toBe(false);
  });

  it("maps database errors to bounded safe UI codes", () => {
    expect(mapCheckinSafeError("checkin_token_invalid_or_expired")).toBe("expired");
    expect(mapCheckinSafeError("checkin_session_not_active")).toBe("session_closed");
    expect(mapCheckinSafeError("raw postgres details must not pass through")).toBe("temporary");
  });
});
