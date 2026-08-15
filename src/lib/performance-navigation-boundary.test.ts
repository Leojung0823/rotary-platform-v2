import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("performance-first navigation boundaries", () => {
  it("serves the login experience at the root without a redirect chain", () => {
    const rootPage = source("src/app/page.tsx");
    const loginPage = source("src/app/login/page.tsx");

    expect(rootPage).toContain("<LoginPage");
    expect(rootPage).not.toContain("redirect(");
    expect(loginPage).not.toContain("getAuthenticatedUser");
    expect(loginPage).toContain("<LoginSessionRedirect returnTo={returnTo} />");
  });

  it("streams a complete shell before authenticated data resolves", () => {
    const layout = source("src/app/(authenticated)/layout.tsx");
    const loading = source("src/app/(authenticated)/loading.tsx");

    expect(layout).toContain("<Suspense fallback={<AppShellLoading />}");
    expect(loading).toContain("<PageLoading />");
  });

  it("deduplicates identity resolution inside one server render", () => {
    const auth = source("src/lib/auth.ts");
    expect(auth).toContain("export const requireIdentity = cache(resolveIdentity)");
  });

  it("does not wait for diagnostic writes before rendering the homepage", () => {
    const context = source("src/lib/experience-context.server.ts");
    const memberHome = source("src/lib/member-home.server.ts");

    expect(context).toContain("void recordResolutionTelemetry");
    expect(memberHome).toContain("void recordProjectionTelemetry");
  });
});
