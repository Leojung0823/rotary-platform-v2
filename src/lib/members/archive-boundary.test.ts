import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260914000100_member_archive.sql", "utf8");

describe("member archive", () => {
  it("keeps archived members out of the main roster unless asked for by status", () => {
    expect(migration).toContain("membership.membership_status not in ('disabled', 'ended')");
    expect(migration).toContain("p_status is not null or");
  });

  it("orders the archive by when each member was archived", () => {
    expect(migration).toContain("order by membership.archived_at desc nulls last");
  });

  it("clears the archive timestamp when a member is restored", () => {
    expect(migration).toContain("archived_at = case when p_status = 'disabled' then now() else null end");
  });

  it("backfills existing rows from the audit trail rather than updated_at alone", () => {
    expect(migration).toContain("action_key = 'membership.status_changed'");
    expect(migration).toContain("order by log.created_at desc");
  });

  // Restating an RPC from an older migration silently drops whatever later
  // migrations added to it. The first draft of this change revived the
  // 2026-07-22 body and lost session and device revocation; the verification
  // suite caught it, but only after the migration had been written.
  it("keeps the revocation behaviour a later migration added to set_membership_status", () => {
    const fn = migration.slice(migration.indexOf("create or replace function public.set_membership_status("));
    expect(fn).toContain("delete from auth.sessions");
    expect(fn).toContain("update public.user_devices");
    expect(fn).toContain("self_membership_suspend_requires_platform_admin");
    expect(fn).toContain("'previous_status', previous_status");
  });

  it("keeps the archive projection behind the same permission as the roster", () => {
    const fn = migration.slice(migration.indexOf("create or replace function public.list_club_archived_members("));
    expect(fn).toContain("public.current_has_club_permission(p_club_id, 'member.read')");
    expect(migration).toContain("revoke all on function public.list_club_archived_members(uuid, text) from public, anon;");
  });
});
