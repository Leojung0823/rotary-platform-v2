import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("event check-in application boundary", () => {
  const actions = source("app/checkin-actions.ts");
  const memberPage = source("app/(authenticated)/events/checkin/page.tsx");
  const managerPage = source("app/(authenticated)/events/[eventId]/checkin/page.tsx");
  const tokenControls = source("components/events/checkin-token-controls.tsx");

  it("keeps raw tokens out of redirects and renders them only from server-action state", () => {
    expect(actions).toContain('return { status: "success", operation, ...token }');
    expect(actions).not.toContain('params.set("token"');
    expect(actions).not.toMatch(/redirect\([^\n]*[?&]token=/u);
    expect(tokenControls).toContain("value={state.token}");
    expect(tokenControls).toContain("原始 token 只顯示這一次");
  });

  it("uses controlled RPCs rather than direct attendance table CRUD", () => {
    for (const rpc of [
      "open_event_checkin",
      "rotate_event_checkin_token",
      "close_event_checkin",
      "check_in_to_event",
      "manual_check_in_event",
      "revoke_event_attendance",
    ]) {
      expect(actions).toContain(`rpc(\"${rpc}\"`);
    }
    expect(actions).not.toContain('.from("event_attendances")');
    expect(actions).not.toContain('.from("event_checkin_sessions")');
  });

  it("does not request member contact or LINE identity data for attendance management", () => {
    expect(managerPage).toContain("display_name");
    expect(managerPage).not.toContain("primary_phone");
    expect(managerPage).not.toContain("primary_email");
    expect(managerPage).not.toContain("provider_subject");
    expect(memberPage).not.toContain("dangerouslySetInnerHTML");
    expect(managerPage).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("event check-in database boundary", () => {
  const migration = source("../supabase/migrations/20260730000100_event_checkin_mvp.sql");

  it("stores token hashes and denies browser table access", () => {
    expect(migration).toContain("extensions.digest(raw_token, 'sha256')");
    expect(migration).toContain("revoke all on table public.event_checkin_sessions, public.event_attendances from public, anon, authenticated");
    expect(migration).not.toMatch(/insert into public\.event_checkin_sessions[\s\S]{0,500}raw_token\s*,/u);
  });

  it("derives self check-in membership from the authenticated account", () => {
    expect(migration).toContain("actor_id uuid := public.current_app_account_id()");
    expect(migration).toContain("join public.club_memberships as membership on membership.person_id = account.person_id");
    expect(migration).toContain("account.id = actor_id");
    expect(migration).not.toContain("check_in_to_event(p_token text, p_membership_id uuid)");
  });

  it("enforces single active sessions, single active attendance, tenant foreign keys, and append-only history", () => {
    expect(migration).toContain("event_checkin_sessions_one_active_event");
    expect(migration).toContain("event_attendances_one_active_member_event");
    expect(migration).toContain("event_attendances_event_club_fkey");
    expect(migration).toContain("event_attendances_membership_club_fkey");
    expect(migration).toContain("event_attendance_hard_delete_forbidden");
    expect(migration).toContain("attendance.revoked");
  });
});
