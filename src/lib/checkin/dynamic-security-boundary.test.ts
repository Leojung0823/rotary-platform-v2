import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("dynamic QR V2 application boundary", () => {
  const actions = source("app/checkin-actions.ts");
  const memberPage = source("app/(authenticated)/events/checkin/page.tsx");
  const managerPage = source("app/(authenticated)/events/[eventId]/checkin/page.tsx");
  const managerControls = source("components/events/dynamic-checkin-controls.tsx");
  const scanner = source("components/events/dynamic-checkin-camera-scanner.tsx");

  it("evaluates the existing server-side flag and retains legacy surfaces as fallback", () => {
    expect(memberPage).toContain('key: "checkin_qr_v2"');
    expect(managerPage).toContain('key: "checkin_qr_v2"');
    expect(memberPage).toContain("<DynamicCheckinCameraScanner />");
    expect(memberPage).toContain("<CheckinCameraScanner />");
    expect(managerPage).toContain("<DynamicCheckinControls");
    expect(managerPage).toContain("<CheckinTokenControls");
  });

  it("uses only controlled RPCs and keeps a recoverable failure free of raw credentials", () => {
    for (const rpc of [
      "open_dynamic_event_checkin",
      "issue_dynamic_event_checkin_credential",
      "check_in_to_dynamic_event",
      "close_event_checkin",
      "manual_check_in_event",
      "revoke_event_attendance",
    ]) expect(actions).toContain(`"${rpc}"`);
    expect(actions).not.toContain('.from("event_checkin_qr_credentials")');
    const dynamicSelfAction = actions.split("export async function selfDynamicCheckinAction")[1]?.split("export async function closeDynamicCheckinAction")[0] ?? "";
    expect(dynamicSelfAction).not.toContain("redirect(");
    expect(actions).toContain('status: "error", revision');
    expect(actions).not.toContain('credential: credential, code');
  });

  it("does not offer a raw credential field in V2 and preserves camera privacy", () => {
    expect(managerControls).toContain("<CheckinQrCode token={credentialState.credential} />");
    expect(managerControls).not.toContain("textarea");
    expect(scanner).toContain('formData.set("credential", credential)');
    expect(scanner).toContain("jsQR(image.data");
    expect(scanner).toContain("getTracks().forEach((track) => track.stop())");
    for (const forbidden of ["fetch(", "localStorage", "sessionStorage", "console.", "location.href"]) {
      expect(scanner).not.toContain(forbidden);
    }
  });
});

describe("dynamic QR V2 database boundary", () => {
  const migration = source("../supabase/migrations/20260812000100_dynamic_qr_checkin_v2.sql");

  it("stores only hashes, limits TTL and overlap, and retains the parent session boundary", () => {
    expect(migration).toContain("event_checkin_qr_credentials");
    expect(migration).toContain("credential_hash text not null unique");
    expect(migration).not.toContain("raw_credential text not null");
    expect(migration).toContain("event_checkin_v2_credential_ttl_seconds");
    expect(migration).toContain("event_checkin_v2_credential_overlap_seconds");
    expect(migration).toContain("valid_until = least(valid_until");
    expect(migration).toContain("revoke_reason = 'emergency_rotation'");
  });

  it("uses tenant-linked, security-definer RPCs and no browser table CRUD", () => {
    expect(migration).toContain("foreign key (checkin_session_id, club_id, event_id)");
    expect(migration).toContain("security definer");
    expect(migration).toContain("current_can_manage_event_checkin(p_club_id)");
    expect(migration).toContain("join public.club_memberships as membership on membership.person_id = account.person_id");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("revoke all on table public.event_checkin_qr_credentials from public, anon, authenticated");
  });
});
