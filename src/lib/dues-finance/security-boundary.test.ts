import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("dues finance application boundary", () => {
  const managementPage = source("src/app/(authenticated)/clubs/[clubId]/dues/page.tsx");
  const memberPage = source("src/app/(authenticated)/dues/page.tsx");
  const mutationRoute = source("src/app/api/v1/dues-finance/route.ts");
  const reportRoute = source("src/app/api/v1/dues-finance/report/route.ts");
  const exportRoute = source("src/app/api/v1/dues-finance/export/route.ts");

  it("keeps management data behind the feature flag, management mode, and finance permission", () => {
    expect(managementPage).toContain('key: "dues_finance_v1"');
    expect(managementPage).toContain('query.mode !== "management"');
    expect(managementPage).toContain('permissionsResult.permissions.includes("finance.read")');
    expect(managementPage).toContain('rpc("list_dues_finance_rotary_years"');
    expect(managementPage).toContain('rpc("get_club_dues_finance_ledger"');
    expect(managementPage).not.toContain(".from(");
  });

  it("keeps the member page member-only and uses the member projection", () => {
    expect(memberPage).toContain('query.mode === "management"');
    expect(memberPage).toContain('mode === "management"');
    expect(memberPage).toContain("contextResolution.context.memberClubs");
    expect(memberPage).toContain('rpc("get_my_dues_finance_ledger"');
    expect(memberPage).not.toContain('rpc("get_club_dues_finance_ledger"');
    expect(memberPage).not.toContain('rpc("list_dues_finance_rotary_years"');
    expect(memberPage).not.toContain(".from(");
  });

  it("keeps all mutations and report reads authenticated, RPC-only, and uncached", () => {
    expect(mutationRoute).toContain('key: "dues_finance_v1"');
    expect(mutationRoute).toContain("duesFinanceMutationAllowed");
    expect(mutationRoute).toContain("export async function POST");
    expect(mutationRoute).not.toContain(".from(");
    expect(reportRoute).toContain('key: "dues_finance_v1"');
    expect(reportRoute).toContain('client.rpc("get_club_dues_finance_report"');
    expect(reportRoute).toContain('dynamic = "force-dynamic"');
    expect(reportRoute).not.toContain(".from(");
    expect(exportRoute).toContain('client.rpc("get_club_dues_finance_report"');
    expect(exportRoute).toContain('value === "pdf"');
    expect(exportRoute).toContain('"cache-control": "no-store"');
    expect(exportRoute).not.toMatch(/\b(?:client|supabase)\.from\(/u);
    for (const route of [mutationRoute, reportRoute, exportRoute]) {
      expect(route).not.toContain("error.message");
      expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });
});

describe("dues finance database boundary", () => {
  const core = source("supabase/migrations/20260914000400_dues_finance_v1_core.sql");
  const read = source("supabase/migrations/20260914000500_dues_finance_read_projection.sql");
  const reporting = source("supabase/migrations/20260914000600_dues_finance_reporting.sql");
  const verification = source("supabase/verification/dues_finance_read_projection_security.sql");

  it("keeps the finance tables browser-inaccessible and the core functions scoped", () => {
    expect(core).toContain("revoke all on table public.club_finance_annual_dues_defaults");
    expect(core).toContain("foreign key (rotary_year_id, club_id)");
    expect(core).toContain("foreign key (membership_id, club_id)");
    expect(core).toContain("security definer");
    expect(core).toContain("set search_path = pg_catalog, public, auth");
    expect(core).toContain("dues_finance_v1");
    expect(core).toContain("revoke all on function public.current_has_dues_finance_permission(uuid, text)");
  });

  it("adds role coverage, keeps helper functions private, and verifies negative cases", () => {
    expect(read).toContain("('secretary', 'finance.read')");
    expect(read).toContain("('finance', 'finance.read')");
    expect(read).toContain("revoke all on function public.list_dues_finance_rotary_years(uuid)");
    expect(read).toContain("revoke all on function public.project_dues_advance(uuid)");
    expect(reporting).toContain("current_has_dues_finance_permission(p_club_id, 'finance.read')");
    expect(reporting).toContain("set search_path = pg_catalog, public, auth");
    expect(reporting).toContain("revoke all on function public.get_club_dues_finance_report(uuid, uuid)");
    expect(reporting).toContain("revoke all on function public.get_club_dues_annual_default(uuid, uuid)");
    expect(verification).toContain("ordinary member crossed the finance tenant boundary");
    expect(verification).toContain("finance role crossed the report tenant boundary");
    expect(verification).toContain("member crossed the year tenant boundary");
  });
});
