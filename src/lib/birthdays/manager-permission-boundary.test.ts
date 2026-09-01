import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

describe("birthday collection manager permission boundary", () => {
  const migration = source("supabase/migrations/20260901000100_birthday_collection_manager_permissions.sql");
  const shared = source("supabase/migrations/20260722000200_secure_provisioning_workflow.sql");
  const verification = source("supabase/verification/birthday_collection_manager_permissions_security.sql");
  const manifest = source("scripts/database-verification-files.txt");

  it("resolves birthday management through the shared permission helper", () => {
    // 'member.manage' is held by president, secretary and -- through the
    // club_operator_permissions branch that borrows the secretary set --
    // executive secretary. Finance and member never hold it.
    expect(migration).toContain("create or replace function public.current_can_manage_birthday_collection(target_club_id uuid)");
    expect(migration).toContain("select public.current_has_club_permission(target_club_id, 'member.manage')");
    expect(migration).toContain("revoke all on function public.current_can_manage_birthday_collection(uuid) from public, anon, authenticated;");
  });

  it("leaves the shared club management helper alone", () => {
    // current_can_manage_club is used by provisioning and other domains, so
    // widening it there would grant far more than birthdays.
    expect(migration).not.toContain("create or replace function public.current_can_manage_club");
    expect(shared).toContain("create or replace function public.current_can_manage_club(target_club_id uuid)");
  });

  it("moves every birthday manager check off the operator-only helper", () => {
    expect(migration).not.toContain("public.current_can_manage_club(");
    expect(migration.match(/public\.current_can_manage_birthday_collection\(/gu)?.length ?? 0)
      .toBeGreaterThanOrEqual(16);
  });

  it("lets the scheduler find the club's own president and secretary", () => {
    const scheduler = migration.split("create or replace function public.run_birthday_wish_collection_scheduler")[1] ?? "";
    expect(scheduler).toContain("from public.club_role_assignments as assignment");
    expect(scheduler).toContain("assignment.role_key in ('president', 'secretary')");
    expect(scheduler).toContain("permission.permission_level = 'club_manager'");
    // Executive secretary first, then president, then secretary.
    expect(scheduler).toContain("case assignment.role_key when 'president' then 2 else 3 end as manager_priority");
    expect(scheduler).toContain("order by candidate.manager_priority");
  });

  it("keeps the automatic actor a real officer of that same club", () => {
    const scheduler = migration.split("create or replace function public.run_birthday_wish_collection_scheduler")[1] ?? "";
    // A platform administrator must never be borrowed as the acting manager,
    // and neither may an officer of a different club.
    expect(scheduler).not.toContain("current_has_platform_role");
    expect(scheduler).not.toContain("platform_admin");
    expect(scheduler).toContain("where assignment.club_id = club_row.id");
    expect(scheduler).toContain("where permission.club_id = club_row.id");
    // Membership and account state are still required on the role path.
    expect(scheduler).toContain("membership.membership_status = 'active'");
    expect(scheduler).toContain("account.account_status = 'active'");
    expect(scheduler).toContain("account.auth_user_id is not null");
  });

  it("names the skip reason instead of reporting a bare count", () => {
    expect(migration).toContain("skipped_no_manager_count");
    expect(migration).toContain("'no_active_birthday_manager', skipped_no_manager_count");
    // Club identifiers must not travel into the scheduler's CI log output.
    const result = migration.split("return jsonb_build_object(")[1] ?? "";
    expect(result).not.toContain("club_row.id");
  });

  it("leaves the seven-day window behind", () => {
    // The window itself moved on again in 20260901000200; see
    // dispatch-lead-month-boundary.test.ts for the window that is current.
    expect(migration).not.toContain("clock.local_today + 7");
    // The month is still read in the club's own timezone.
    expect(migration).toContain("(p_as_of at time zone club_row.timezone_name)::date as local_today");
  });

  it("is covered by a registered verification file", () => {
    expect(manifest).toContain("supabase/verification/birthday_collection_manager_permissions_security.sql");
    for (const forbidden of ["finance was allowed", "ordinary member was allowed", "revoked president retained"]) {
      expect(verification).toContain(forbidden);
    }
    expect(verification).toContain("president of another club could manage this club");
    expect(verification).toContain("rollback;");
  });
});
