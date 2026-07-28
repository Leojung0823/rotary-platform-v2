import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("authenticated shell logout integration", () => {
  const shell = source("components/app-shell.tsx");
  const route = source("app/api/auth/line/logout/route.ts");

  it("posts the primary logout control through the hardened LINE MVP cleanup route", () => {
    expect(shell).toContain('action="/api/auth/line/logout?redirect=1"');
    expect(shell).toContain('method="post"');
    expect(shell).not.toContain("logoutAction");
    expect(route).toContain("clearLineMvpCookies(store)");
    expect(route).toContain("trustedLineRedirectUrl");
  });
});
