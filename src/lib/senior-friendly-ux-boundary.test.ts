import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("senior-friendly UX guardrails", () => {
  it("keeps shared controls at the minimum touch size", () => {
    const globalCss = read("src/app/globals.css");
    const shellCss = read("src/components/role-aware-app-shell.module.css");

    expect(globalCss).toMatch(/\.button\s*\{[^}]*min-height:\s*48px/u);
    expect(globalCss).toMatch(/\.input\s*\{[^}]*min-height:\s*48px/u);
    expect(globalCss).toMatch(/\.checkbox-row\s*\{[^}]*min-height:\s*48px/u);
    expect(shellCss).toMatch(/\.navigation a\s*\{[^}]*min-height:\s*48px/u);
    expect(shellCss).toMatch(/\.accountPanel a, \.accountPanel button\s*\{[^}]*min-height:\s*48px/u);
  });

  it("has a mobile card contract for the measured wide tables", () => {
    const priorityPages = [
      "src/app/(authenticated)/me/security/page.tsx",
      "src/app/(authenticated)/attendance/page.tsx",
      "src/app/(authenticated)/attendance/manage/page.tsx",
      "src/app/(authenticated)/me/page.tsx",
      "src/components/blessing-iou/blessing-iou-report.tsx",
      "src/app/(authenticated)/clubs/[clubId]/line-oa/page.tsx",
    ];

    for (const path of priorityPages) {
      const source = read(path);
      expect(source).toContain("data-mobile-cards");
      expect(source).toMatch(/data-label=/u);
    }
  });

  it("does not expose the internal feature map to ordinary authenticated users", () => {
    const featurePage = read("src/app/(authenticated)/features/page.tsx");
    const featureDetailPage = read("src/app/(authenticated)/features/[slug]/page.tsx");
    const legacyShell = read("src/components/app-shell.tsx");

    expect(featurePage).toContain("hasPlatformAccess");
    expect(featurePage).toContain('redirect("/dashboard")');
    expect(featureDetailPage).toContain("hasPlatformAccess");
    expect(featureDetailPage).toContain('redirect("/dashboard")');
    expect(legacyShell).not.toContain('href="/features"');
  });

  it("keeps important home work ahead of secondary links", () => {
    const memberHome = read("src/components/member-home.tsx");
    expect(memberHome.indexOf("<MemberHomeContent activeClubId")).toBeGreaterThan(
      memberHome.indexOf('<header className="page-header">'),
    );
    expect(memberHome.indexOf("secondarySection")).toBeGreaterThan(
      memberHome.indexOf("<MemberHomeContent activeClubId"),
    );
  });
});
