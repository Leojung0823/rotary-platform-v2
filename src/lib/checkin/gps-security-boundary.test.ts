import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function migration(name: string) {
  return readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");
}

describe("GPS check-in application boundary", () => {
  const actions = source("app/checkin-actions.ts");
  const panel = source("components/events/location-checkin-panel.tsx");
  const page = source("app/(authenticated)/events/checkin/page.tsx");

  it("is gated by the existing rollout flag and leaves the QR path intact", () => {
    expect(page).toContain('key: "checkin_gps_v2"');
    expect(page).toContain("gpsCheckin.enabled && <LocationCheckinPanel");
    // Either check-in method alone must still work.
    expect(page).toContain("<DynamicCheckinCameraScanner />");
    expect(page).toContain("<CheckinCameraScanner />");
  });

  it("mutates only through the controlled RPC", () => {
    expect(actions).toContain('rpc("check_in_to_event_by_location"');
    expect(actions).not.toContain('.from("event_attendances")');
    expect(actions).not.toContain('.from("club_events")');
  });

  it("reads the member position once and never persists or exposes it", () => {
    expect(panel).toContain("navigator.geolocation.getCurrentPosition");
    expect(panel).toContain("maximumAge: 0");
    for (const forbidden of ["watchPosition", "localStorage", "sessionStorage", "console.", "fetch(", "location.href"]) {
      expect(panel).not.toContain(forbidden);
    }
    // Coordinates travel in the action body, never in a URL or logged state.
    expect(panel).not.toContain('params.set("latitude"');
    expect(actions).not.toContain("console.");
    // They are also never echoed back into the action state the client renders.
    const locationState = actions.split("export type LocationSelfCheckinActionState")[1]
      ?.split(";")[0] ?? "";
    expect(locationState).not.toContain("latitude");
    expect(locationState).not.toContain("longitude");
  });

  it("keeps the out-of-range answer free of any derived distance", () => {
    const locationAction = actions.split("export async function selfLocationCheckinAction")[1]
      ?.split("export async function")[0] ?? "";
    expect(locationAction).toContain("mapCheckinSafeError(error.message)");
    expect(locationAction).not.toContain("distance");
    expect(panel).not.toContain("distance");
  });
});

describe("GPS check-in database boundary", () => {
  const gps = migration("20260819000100_gps_checkin_v2.sql");

  it("stores a venue but has no column able to hold a member position", () => {
    expect(gps).toContain("add column venue_latitude");
    expect(gps).toContain("club_events_venue_pair_check");
    expect(gps).not.toMatch(/alter table public\.event_attendances[\s\S]{0,200}add column (latitude|longitude|distance)/u);
  });

  it("binds a GPS attendance to an open session and keeps the canonical method set closed", () => {
    expect(gps).toContain("check (checkin_method in ('qr', 'manual', 'gps'))");
    expect(gps).toContain("(checkin_method in ('qr', 'gps') and checkin_session_id is not null)");
  });

  it("verifies membership, tenancy and event eligibility before measuring distance", () => {
    const rpc = gps.split("create or replace function public.check_in_to_event_by_location")[1]
      ?.split("revoke all on function")[0] ?? "";
    expect(rpc).toContain("active_membership_required");
    expect(rpc).toContain("checkin_session_not_active");
    expect(rpc).toContain("event_not_checkin_eligible");
    expect(rpc).toContain("security definer");
    expect(rpc).toContain("pg_advisory_xact_lock");
    // The distance is a local variable only; it must not reach the audit row.
    expect(rpc).toContain("distance_meters := public.event_checkin_distance_meters");
    const auditWrite = rpc.split("insert into public.audit_logs")[1] ?? "";
    expect(auditWrite).not.toContain("distance_meters");
    expect(auditWrite).not.toContain("p_latitude");
    expect(auditWrite).not.toContain("p_longitude");
  });

  it("holds the radius in one place", () => {
    expect(gps).toContain("function public.event_checkin_gps_radius_meters()");
    expect(gps).toContain("select 200");
    expect(gps).toContain("distance_meters > public.event_checkin_gps_radius_meters()");
  });
});
