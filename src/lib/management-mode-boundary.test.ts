import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("club management route boundary", () => {
  const layout = source("src/app/(authenticated)/clubs/[clubId]/layout.tsx");
  const dashboard = source("src/app/(authenticated)/dashboard/page.tsx");
  const routing = source("src/lib/experience-routing.ts");
  const servicePlanEdit = source("src/app/(authenticated)/club-affairs/service-plan/edit/page.tsx");
  const attendancePage = source("src/app/(authenticated)/attendance/page.tsx");
  const attendanceManagePage = source("src/app/(authenticated)/attendance/manage/page.tsx");
  const attendanceActions = source("src/app/attendance-actions.ts");

  it("requires the proxy-selected management mode and the server role projection", () => {
    expect(layout).toContain('headerStore.get("x-rotary-requested-mode") !== "management"');
    expect(layout).toContain("currentExperienceMode(identity.id)");
    expect(layout).toContain("mode !== null && !isManagementMode(mode)");
    expect(layout).toContain('redirect("/access-denied")');
  });

  it("keeps management entry links in management mode", () => {
    expect(dashboard).toContain("/identity?mode=management");
    expect(routing).toContain("/identity?mode=management");
  });

  it("protects the service-plan editor even though it is outside the club route", () => {
    expect(servicePlanEdit).toContain('headerStore.get("x-rotary-requested-mode") !== "management"');
    expect(servicePlanEdit).toContain("currentExperienceMode(identity.id)");
    expect(servicePlanEdit).toContain("isManagementMode(mode)");
    expect(servicePlanEdit).toContain('redirect("/access-denied")');
  });

  it("keeps attendance management links, filters, and action results in management mode", () => {
    expect(attendancePage).toContain('href="/attendance/manage?mode=management"');
    expect(attendanceManagePage).toContain('href="/attendance?mode=member"');
    expect(attendanceManagePage).toContain('new URLSearchParams({ clubId: selectedClub.club_id, mode: "management" })');
    expect(attendanceManagePage).toContain('<input type="hidden" name="mode" value="management" />');
    expect(attendanceActions).toContain('new URLSearchParams({ clubId, mode: "management", [key]: code })');
    expect(attendanceActions).toContain('redirect("/attendance/manage?mode=management&error=invalid_input")');
  });
});
