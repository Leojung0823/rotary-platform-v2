import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("V0.8 attendance database boundary", () => {
  const migration = source("../supabase/migrations/20260731000100_v08_attendance_management.sql");
  const verification = source("../supabase/verification/attendance_management_security.sql");

  it("keeps raw attendance separate from append-only adjustments", () => {
    expect(migration).toContain("create table public.attendance_adjustments");
    expect(migration).not.toMatch(/update public\.event_attendances[\s\S]*adjustment/iu);
    expect(migration).toContain("attendance_adjustment_hard_delete_forbidden");
    expect(migration).toContain("attendance_adjustments_one_active_member_event");
    expect(migration).toContain("attendance_adjustment_immutable_field");
  });

  it("uses complete tenant foreign keys and denies browser table CRUD", () => {
    expect(migration).toContain("attendance_adjustments_event_club_fkey");
    expect(migration).toContain("foreign key (event_id, club_id)");
    expect(migration).toContain("attendance_adjustments_membership_club_fkey");
    expect(migration).toContain("foreign key (membership_id, club_id)");
    expect(migration).toContain("revoke all on table public.attendance_adjustments from public, anon, authenticated");
  });

  it("publishes only bounded, tenant-explicit, fixed-search-path RPCs", () => {
    for (const rpc of [
      "list_my_attendance_history",
      "get_my_attendance_summary",
      "get_event_attendance_roster",
      "set_attendance_adjustment",
      "revoke_attendance_adjustment",
      "get_club_attendance_summary",
      "export_event_attendance_csv",
    ]) {
      expect(migration).toContain(`function public.${rpc}`);
    }
    expect(migration).toContain("p_date_to - p_date_from <= 366");
    expect(migration).toContain("set search_path = pg_catalog, public, auth");
    expect(migration).toContain("actor_id uuid := public.current_app_account_id()");
  });

  it("makes denominator and final-status policy explicit", () => {
    expect(migration).toContain("attendance_official_leave_counts_in_denominator");
    expect(migration).toMatch(/attendance_official_leave_counts_in_denominator\(\)[\s\S]*select false/iu);
    expect(migration).toMatch(/when raw\.id is not null then 'present'/u);
    expect(migration).toContain("adjustment.effective_status = 'makeup'");
    expect(migration).toContain("membership.membership_status = 'active'");
    expect(verification).toContain("executive secretary entered member denominator");
    expect(verification).toContain("cancelled event entered attendance statistics");
    expect(verification).toContain("counts_for_attendance false event entered denominator");
  });

  it("covers cross-club, lifecycle, history, audit, and export privacy negatives", () => {
    for (const phrase of [
      "Club B member read Club A attendance",
      "suspended account read attendance",
      "suspended membership read new attendance data",
      "suspended club accepted an attendance mutation",
      "cross-club attendance adjustment was inserted",
      "attendance adjustment mutation audit is missing",
      "attendance export projection leaked a forbidden privacy field",
    ]) {
      expect(verification).toContain(phrase);
    }
  });
});

describe("V0.8 attendance application boundary", () => {
  const actions = source("app/attendance-actions.ts");
  const memberPage = source("app/(authenticated)/attendance/page.tsx");
  const managerPage = source("app/(authenticated)/attendance/manage/page.tsx");
  const exportRoute = source("app/api/v1/clubs/[clubId]/attendance/export/route.ts");
  const shell = source("components/app-shell.tsx");

  it("uses controlled RPCs and does not directly CRUD attendance tables", () => {
    expect(actions).toContain('rpc("set_attendance_adjustment"');
    expect(actions).toContain('rpc("revoke_attendance_adjustment"');
    expect(actions).not.toContain('.from("attendance_adjustments")');
    expect(memberPage).toContain('rpc("get_my_attendance_summary"');
    expect(managerPage).toContain('rpc("get_event_attendance_roster"');
  });

  it("exposes member attendance navigation and gates the management page", () => {
    expect(shell.match(/href="\/attendance"/gu)).toHaveLength(2);
    expect(managerPage).toContain('redirect("/access-denied?reason=attendance_manage_required")');
    expect(managerPage).toContain("club.can_manage");
  });

  it("supports all adjustment controls, revocation reasons, and safe CSV", () => {
    for (const type of ["leave", "official_leave", "makeup", "exempt"]) {
      expect(managerPage).toContain(`value="${type}"`);
    }
    expect(managerPage).toContain("revokeAttendanceAdjustmentAction");
    expect(managerPage).toContain("撤銷原因");
    expect(exportRoute).toContain("buildAttendanceCsv(rows)");
    expect(exportRoute).toContain('"cache-control": "private, no-store"');
    expect(exportRoute).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("does not render member identity, LINE, token, device, or session identifiers", () => {
    const publicSurface = `${memberPage}\n${managerPage}\n${exportRoute}`;
    for (const privateField of ["auth_user_id", "person_id", "provider_subject", "token_hash", "device_id", "session_id"]) {
      expect(publicSurface).not.toContain(privateField);
    }
    expect(publicSurface).not.toContain("dangerouslySetInnerHTML");
  });
});
