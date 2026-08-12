import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { buildForwardedRequestHeaders, proxy, shouldRefreshAuthSession } from "./proxy";

describe("auth session proxy", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    mocks.getClaims.mockReset().mockResolvedValue({ data: { claims: { sub: "person-id" } }, error: null });
    mocks.getUser.mockReset();
    mocks.createServerClient.mockReset().mockReturnValue({
      auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("refreshes only protected and session-sensitive page routes", () => {
    expect(shouldRefreshAuthSession("/dashboard")).toBe(true);
    expect(shouldRefreshAuthSession("/clubs/club-id/members")).toBe(true);
    expect(shouldRefreshAuthSession("/invite/accept")).toBe(true);
    expect(shouldRefreshAuthSession("/reset-password")).toBe(true);

    expect(shouldRefreshAuthSession("/")).toBe(false);
    expect(shouldRefreshAuthSession("/login")).toBe(false);
    expect(shouldRefreshAuthSession("/status")).toBe(false);
    expect(shouldRefreshAuthSession("/api/health")).toBe(false);
    expect(shouldRefreshAuthSession("/dashboard-preview")).toBe(false);
  });

  it("does no Supabase work for a public route", async () => {
    const response = await proxy(new NextRequest("https://app.example.test/login"));

    expect(response.status).toBe(200);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("server-timing")).toBeNull();
  });

  it("uses verified claims instead of a remote user lookup and exposes timing", async () => {
    const response = await proxy(new NextRequest("https://app.example.test/dashboard"));

    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(response.headers.get("server-timing")).toMatch(/^auth;dur=\d+\.\d$/);
  });

  it("redirects an anonymous protected route before a streamed page can return 200", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    const response = await proxy(new NextRequest("https://app.example.test/dashboard?mode=platform"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/login");
    expect(response.headers.get("server-timing")).toBeNull();
  });

  it("does not redirect anonymous visitors on invitation and reset-password pages", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    for (const path of ["/join", "/invite/accept", "/reset-password"]) {
      const response = await proxy(new NextRequest(`https://app.example.test${path}?token=abc`));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("still refreshes cookies for an already-authenticated visitor on the join page", async () => {
    const response = await proxy(new NextRequest("https://app.example.test/join?token=abc"));

    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
  });

  it("fails closed to the same-origin login route when claims verification errors", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: { message: "test-only" } });

    const response = await proxy(new NextRequest("https://app.example.test/events"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/login");
  });

  it("fails closed when claims verification throws", async () => {
    mocks.getClaims.mockRejectedValue(new Error("test-only transport failure"));

    const response = await proxy(new NextRequest("https://app.example.test/me"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/login");
  });

  it("preserves refreshed auth cookies on the anonymous login redirect", async () => {
    mocks.createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        getClaims: async () => {
          options.cookies.setAll([{
            name: "sb-example-auth-token",
            value: "cleared-or-refreshed-session-cookie",
            options: { httpOnly: true, path: "/", sameSite: "lax" },
          }]);
          return { data: { claims: null }, error: null };
        },
      },
    }));

    const response = await proxy(new NextRequest("https://app.example.test/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/login");
    expect(response.cookies.get("sb-example-auth-token")?.value).toBe("cleared-or-refreshed-session-cookie");
  });

  it("fails closed when protected-route auth configuration is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    const response = await proxy(new NextRequest("https://app.example.test/dashboard"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example.test/login");
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it("forwards refreshed session cookies to this request and overwrites browser-supplied rotary headers", async () => {
    mocks.createServerClient.mockImplementation((_url, _key, options) => ({
      auth: {
        getClaims: async () => {
          options.cookies.setAll([{
            name: "sb-example-auth-token",
            value: "refreshed-session-cookie",
            options: { httpOnly: true, path: "/", sameSite: "lax" },
          }]);
          return { data: { claims: { sub: "person-id" } }, error: null };
        },
        getUser: mocks.getUser,
      },
    }));
    const request = new NextRequest("https://app.example.test/dashboard?mode=management", {
      headers: {
        cookie: "sb-example-auth-token=stale-session-cookie; app-preference=kept",
        "x-rotary-pathname": "/platform/clubs",
        "x-rotary-requested-mode": "platform",
      },
    });

    const response = await proxy(request);
    const forwarded = buildForwardedRequestHeaders(request);

    expect(request.cookies.get("sb-example-auth-token")?.value).toBe("refreshed-session-cookie");
    expect(forwarded.get("cookie")).toContain("sb-example-auth-token=refreshed-session-cookie");
    expect(forwarded.get("cookie")).toContain("app-preference=kept");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("sb-example-auth-token=refreshed-session-cookie");
    expect(response.cookies.get("sb-example-auth-token")?.value).toBe("refreshed-session-cookie");
    expect(forwarded.get("x-rotary-pathname")).toBe("/dashboard");
    expect(forwarded.get("x-rotary-requested-mode")).toBe("management");
    expect(response.headers.get("x-middleware-request-x-rotary-pathname")).toBe("/dashboard");
    expect(response.headers.get("x-middleware-request-x-rotary-requested-mode")).toBe("management");
  });
});
