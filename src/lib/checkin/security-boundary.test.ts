import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) { return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"); }

describe("event check-in application boundary", () => {
  const actions = source("app/checkin-actions.ts");
  const memberPage = source("app/(authenticated)/events/[eventId]/checkin/page.tsx");
  const managerPage = source("app/(authenticated)/clubs/[clubId]/attendance/[eventId]/page.tsx");
  const gps = source("components/events/gps-checkin-button.tsx");

  it("supports GPS, dynamic QR confirmation, and manual fallback through controlled RPCs", () => {
    for (const rpc of ["configure_event_checkin", "start_event_checkin_session", "issue_event_checkin_qr", "preview_event_qr_checkin", "confirm_event_qr_checkin", "check_in_by_gps", "record_client_checkin_failure", "close_event_checkin", "manual_check_in_event", "revoke_event_attendance"]) expect(actions).toContain(`"${rpc}"`);
    expect(actions).not.toContain('.from("event_attendances")');
    expect(actions).not.toContain('.from("event_checkin_sessions")');
  });

  it("takes one high-accuracy location only after the member clicks", () => {
    expect(gps).toContain("navigator.geolocation.getCurrentPosition");
    expect(gps).toContain("enableHighAccuracy: true");
    expect(gps).toContain("maximumAge: 0");
    expect(gps).toContain("location_permission_denied");
    expect(memberPage).toContain("<GpsCheckinButton");
    expect(gps).toContain("不會持續追蹤");
  });

  it("keeps management and member experiences separate and omits member token input", () => {
    expect(managerPage).toContain("<DynamicCheckinQr");
    expect(managerPage).toContain("<ManualCheckinForm");
    expect(memberPage).not.toContain('name="token"');
    expect(memberPage).not.toContain("64");
    expect(memberPage).not.toContain("primary_phone");
  });
});

describe("event check-in v2 database boundary", () => {
  const migration = source("../supabase/migrations/20260805000200_event_checkin_v2.sql");
  const baseMigration = source("../supabase/migrations/20260730000100_event_checkin_mvp.sql");

  it("stores only hashes for short-lived QR credentials and revokes legacy authenticated RPCs", () => {
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("extensions.digest(raw_token, 'sha256')");
    expect(migration).toContain("qr_rotation_seconds between 30 and 60");
    expect(migration).toContain("revoke execute on function public.check_in_to_event(text) from authenticated");
  });

  it("derives eligibility server-side and preserves idempotent attendance", () => {
    expect(migration).toContain("current_checkin_membership_id");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("already_checked_in");
    expect(baseMigration).toContain("event_attendances_one_active_member_event");
  });

  it("records GPS distance, accuracy, results, and invalidates QR on close", () => {
    expect(migration).toContain("event_distance_meters");
    expect(migration).toContain("accuracy_insufficient");
    expect(migration).toContain("outside_radius");
    expect(migration).toContain("event_checkin_attempts");
    expect(migration).toContain("set invalidated_at = coalesce(invalidated_at, now())");
  });
});
