import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("member profile and account security boundary", () => {
  const profilePage = source("src/app/(authenticated)/me/page.tsx");
  const securityPage = source("src/app/(authenticated)/me/security/page.tsx");

  it("keeps high-risk login controls off the general profile page", () => {
    expect(profilePage).toContain('href="/me/security"');
    expect(profilePage).not.toContain("unbindMyLineIdentityAction");
    expect(profilePage).not.toContain("revokeDeviceAction");
    expect(profilePage).not.toContain("最近登入</h2>");
  });

  it("keeps login methods, device revocation, and recovery help on the security page", () => {
    expect(securityPage).toContain("unbindMyLineIdentityAction");
    expect(securityPage).toContain("revokeDeviceAction");
    expect(securityPage).toContain('href="/forgot-password"');
    expect(securityPage).toContain("最近登入</h2>");
  });
});
