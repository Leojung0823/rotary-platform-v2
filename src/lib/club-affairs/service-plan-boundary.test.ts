import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const baseMigration = readFileSync("supabase/migrations/20260914000800_club_service_plan.sql", "utf8");
const v2Migration = readFileSync("supabase/migrations/20260914001100_club_service_plan_v2.sql", "utf8");
const memberPage = readFileSync("src/app/(authenticated)/club-affairs/page.tsx", "utf8");
const managementPage = readFileSync("src/app/(authenticated)/clubs/[clubId]/service-plan/page.tsx", "utf8");
const legacyEditor = readFileSync("src/app/(authenticated)/club-affairs/service-plan/edit/page.tsx", "utf8");
const actions = readFileSync("src/app/service-plan-actions.ts", "utf8");
const categoryDefinitions = readFileSync("src/lib/club-affairs/service-plan.ts", "utf8");

describe("club service plan", () => {
  it("keeps one plan per club per Rotary year", () => {
    expect(baseMigration).toContain("constraint club_service_plans_year_unique unique (club_id, start_year)");
    expect(v2Migration).toContain("on conflict (club_id, start_year) do update");
  });

  it("does not depend on a rotary_years row existing", () => {
    // Those rows are created by hand from the archive module, so requiring one
    // would make a club set up archives before it could write a service plan.
    const table = baseMigration.slice(baseMigration.indexOf("create table public.club_service_plans"));
    expect(table.slice(0, table.indexOf(");"))).not.toContain("rotary_years");
  });

  it("stores the four service avenues as independently constrained sections", () => {
    expect(v2Migration).toContain("create table public.club_service_plan_sections");
    expect(v2Migration).toContain("constraint club_service_plan_sections_category_unique unique (service_plan_id, category_key)");
    for (const category of ["membership", "vocational", "community", "international"]) {
      expect(v2Migration).toContain(`'${category}'`);
    }
    expect(v2Migration).toContain("p_sections jsonb");
    expect(v2Migration).toContain("jsonb_array_length(p_sections) <> 4");
  });

  it("keeps member mode published-only even when the caller manages the club", () => {
    expect(memberPage).toContain("p_as_member: true");
    expect(v2Migration).toContain("can_manage := p_as_member is false");
    expect(v2Migration).toContain("plan.plan_status = 'published'");
    expect(v2Migration).toContain("p_as_member is false and can_manage");
    for (const category of ["社員服務", "職業服務", "社區服務", "國際服務"]) {
      expect(categoryDefinitions).toContain(category);
    }
    expect(memberPage).not.toContain("/club-affairs/service-plan/edit");
  });

  it("requires club management authority and complete sections before publishing", () => {
    expect(v2Migration).toContain("current_can_manage_service_plan(p_club_id)");
    expect(v2Migration).toContain("service_plan_publish_incomplete");
    expect(v2Migration).toContain("on conflict (service_plan_id, category_key) do update");
    expect(actions).toContain("upsert_club_service_plan_v2");
    expect(managementPage).toContain("p_as_member: false");
    expect(managementPage).toContain("if (!page.club || !page.can_manage_plan) redirect(\"/access-denied\")");
  });

  it("gives the president and secretary a narrow management permission", () => {
    expect(v2Migration).toContain("('service_plan.manage', '維護年度服務計劃與執行成果')");
    expect(v2Migration).toContain("('president', 'service_plan.manage')");
    expect(v2Migration).toContain("('secretary', 'service_plan.manage')");
    expect(v2Migration).toContain("('platform_admin', 'service_plan.manage')");
  });

  it("keeps old editor bookmarks but moves the form into management mode", () => {
    expect(legacyEditor).toContain("/service-plan?");
    expect(legacyEditor).toContain("mode");
    expect(legacyEditor).not.toContain("<form");
    expect(managementPage).toContain("儲存草稿");
    expect(managementPage).toContain("發布給社員");
  });
});
