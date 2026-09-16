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
    const supabase = source("src/lib/supabase/server.ts");
    expect(auth).toContain("export const requireIdentity = cache(resolveIdentity)");
    expect(supabase).toContain("export const createClient = cache(createClientForRequest)");
    expect(supabase).not.toContain("unstable_cache");
  });

  it("streams member-home activity after the verified account and club heading", () => {
    // The greeting needs no data, so it must not wait for any: this is the
    // first page after signing in, and blocking all of it on one database
    // round trip delays every pixel.
    const source_ = source("src/components/member-portal/member-portal-home.tsx");
    // Inside MemberPortalHome, not anywhere in the file: there is a second
    // Suspense further up for the LINE pairing prompt, and indexOf found that
    // one instead -- the first draft of this passed for the wrong reason.
    const start = source_.indexOf("export function MemberPortalHome");
    expect(start, "MemberPortalHome is gone").toBeGreaterThan(-1);
    const home = source_.slice(start);
    expect(home).toContain("<Suspense fallback={<MemberPortalBodyLoading />}>");
    expect(home.indexOf("<MemberPortalHeader")).toBeLessThan(home.indexOf("<Suspense"));
  });

  it("does not eagerly prefetch authenticated homepage destinations", () => {
    const shell = source("src/components/role-aware-app-shell.tsx");
    const portal = source("src/components/member-portal/member-portal.tsx");
    expect(shell.match(/<Link/gu)?.length).toBe(shell.match(/prefetch=\{false\}/gu)?.length);
    expect(portal.match(/<Link/gu)?.length).toBe(portal.match(/prefetch=\{false\}/gu)?.length);
  });

  it("eagerly loads the member home's decorative LCP image without making it global", () => {
    const portal = source("src/components/member-portal/member-portal.tsx");
    const authenticatedLayout = source("src/app/(authenticated)/layout.tsx");

    expect(portal).toContain('src="/hero-mountains.webp"');
    expect(portal).toContain('fetchPriority="high"');
    expect(portal).toContain('loading="eager"');
    expect(portal).not.toContain("preload(");
    expect(portal).not.toContain('<link rel="preload" as="image"');
    expect(authenticatedLayout).not.toContain("hero-mountains.webp");
  });

  it("does not wait for diagnostic writes before rendering the homepage", () => {
    const context = source("src/lib/experience-context.server.ts");
    const memberHome = source("src/lib/member-home.server.ts");

    expect(context).toContain("void recordResolutionTelemetry");
    expect(memberHome).toContain("void recordProjectionTelemetry");
  });

  it("does not render a legacy shell around a failed role projection", () => {
    const shell = source("src/components/role-aware-app-shell.tsx");
    const dashboard = source("src/app/(authenticated)/dashboard/page.tsx");
    expect(shell).toContain("<ContextUnavailableScreen />");
    expect(shell).not.toContain("fallbackNotice=");
    expect(dashboard).toContain("<ContextUnavailableScreen />");
    expect(dashboard).not.toContain("contextUnavailable=");
  });
});
