import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

describe("birthday wishes security boundary", () => {
  const migration = source("supabase/migrations/20260820001000_birthday_wishes.sql");
  const page = source("src/app/(authenticated)/birthdays/page.tsx");
  const actions = source("src/app/birthday-actions.ts");

  it("keeps missing preferences private and never projects a birth year", () => {
    expect(migration).toContain("Missing rows mean private");
    expect(migration).toContain("coalesce(preference.is_listed, false)");
    expect(migration).toContain("extract(month from person.birth_date)");
    expect(migration).toContain("extract(day from person.birth_date)");
    expect(migration).not.toContain("'birth_year'");
    expect(page).toContain("不會顯示出生年份或完整生日");
  });

  it("keeps browser access RPC-only and tenant-scoped", () => {
    expect(migration).toContain(
      "revoke all on table public.birthday_visibility_preferences from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on table public.birthday_wishes from public, anon, authenticated",
    );
    expect(migration).toContain("public.current_birthday_membership_id(p_club_id)");
    expect(migration).toContain("membership.club_id = p_club_id");
    expect(actions).not.toContain('.from("birthday_wishes")');
    expect(actions).not.toContain('.from("birthday_visibility_preferences")');
  });

  it("allows authors to remove their own wishes and managers only to hide with a reason", () => {
    expect(migration).toContain("author_app_account_id = actor_id");
    expect(migration).toContain("not public.current_can_manage_club(p_club_id)");
    expect(migration).toContain("invalid_birthday_moderation_reason");
    expect(migration).toContain("birthday_hard_delete_forbidden");
  });
});
