import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260914000300_club_service_plan.sql", "utf8");
const page = readFileSync("src/app/(authenticated)/club-affairs/page.tsx", "utf8");
const editor = readFileSync("src/app/(authenticated)/club-affairs/service-plan/edit/page.tsx", "utf8");

describe("club service plan", () => {
  it("keeps one plan per club per Rotary year", () => {
    expect(migration).toContain("constraint club_service_plans_year_unique unique (club_id, start_year)");
    expect(migration).toContain("on conflict (club_id, start_year) do update");
  });

  it("does not depend on a rotary_years row existing", () => {
    // Those rows are created by hand from the archive module, so requiring one
    // would make a club set up archives before it could write a service plan.
    const table = migration.slice(migration.indexOf("create table public.club_service_plans"));
    expect(table.slice(0, table.indexOf(");"))).not.toContain("rotary_years");
  });

  it("hides a draft from everyone who cannot edit it", () => {
    expect(migration).toContain("plan.plan_status = 'published' or can_manage");
  });

  it("keeps the first publication date across later edits", () => {
    expect(migration).toContain("coalesce(plan.published_at, now())");
  });

  it("requires club authority to write and membership to read", () => {
    expect(migration).toContain("current_can_manage_service_plan");
    expect(migration).toContain("current_has_club_permission(p_club_id, 'member.read')");
  });

  it("tells the officer a draft is private and the member nothing is published", () => {
    expect(page).toContain("這份計劃還是草稿，只有您看得到。");
    expect(page).toContain("本年度的服務計劃尚未發布。");
  });

  it("keeps the paragraphing the officer typed", () => {
    expect(page).toContain("styles.planBody");
    expect(readFileSync("src/app/(authenticated)/club-affairs/club-affairs.module.css", "utf8"))
      .toContain("white-space: pre-wrap");
  });

  it("refuses the editor to someone without the permission", () => {
    expect(editor).toContain("if (!page.can_manage_plan)");
  });
});
