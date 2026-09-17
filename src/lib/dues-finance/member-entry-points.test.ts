import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("member finance entry points", () => {
  const accountPage = source("src/app/(authenticated)/me/page.tsx");
  const interactionPage = source("src/app/(authenticated)/interact/page.tsx");
  const homeProjection = source("src/lib/member-portal/from-projection.ts");
  const memberDues = source("src/components/dues-finance/dues-finance-member.tsx");

  it("puts personal dues in 我的 and the advance action in 社內互動", () => {
    expect(accountPage).toContain('key: "dues_finance_v1"');
    expect(accountPage).toContain('href="/dues?mode=member"');
    expect(interactionPage).toContain('title: "申請代墊核銷"');
    expect(interactionPage).toContain('href: "/dues?mode=member#advance-application"');
    expect(homeProjection).not.toContain('title: "我的社費"');
    expect(memberDues).toContain('id="advance-application"');
  });
});
