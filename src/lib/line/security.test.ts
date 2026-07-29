import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLineMvpCookies,
  clearLineOAuthCookies,
  constantTimeEqual,
  isSameOriginLineRequest,
  lineOAuthCookieOptions,
  lineSiteUrl,
  safeLineRedirectPath,
  setLineOAuthCookies,
} from "./security";

describe("LINE Login redirect and cookie security", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    "/dashboard",
    "/join",
    "/join?token=opaque-value",
    "/clubs/club-id/members?q=test",
  ])("allows a local redirect path: %s", (path) => {
    expect(safeLineRedirectPath(path, "/login")).toBe(path);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "data:text/html,test",
    "%2F%2Fevil.example",
    "%252F%252Fevil.example",
    "/%5Cevil.example",
    "/dashboard%0d%0aLocation:%20https://evil.example",
    "",
    "/dashboard\u0000suffix",
  ])("rejects an unsafe redirect path: %s", (path) => {
    expect(safeLineRedirectPath(path, "/login")).toBe("/login");
  });

  it("uses one explicit ten-minute cookie policy", () => {
    expect(lineOAuthCookieOptions()).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  });

  it("forces Secure cookies from production runtime configuration", () => {
    vi.stubEnv("APP_ENV", "production");
    expect(lineOAuthCookieOptions().secure).toBe(true);
  });

  it("sets and clears all OAuth cookies consistently", () => {
    const set = vi.fn();
    setLineOAuthCookies({ set }, {
      state: "state",
      nonce: "nonce",
      invitation: "invitation",
      returnTo: "/join",
      flow: "invitation",
    });
    expect(set).toHaveBeenCalledTimes(5);
    expect(set).toHaveBeenCalledWith("line_flow", "invitation", expect.any(Object));
    expect(new Set(set.mock.calls.map((call) => JSON.stringify(call[2]))).size).toBe(1);

    set.mockClear();
    clearLineOAuthCookies({ set });
    expect(set.mock.calls.map((call) => call[0])).toEqual([
      "line_oauth_state",
      "line_oauth_nonce",
      "line_invitation",
      "line_return_to",
      "line_flow",
    ]);
    expect(set.mock.calls.every((call) => call[1] === "" && call[2].maxAge === 0)).toBe(true);
  });

  it("clears the device cookie during logout", () => {
    const set = vi.fn();
    clearLineMvpCookies({ set });
    expect(set).toHaveBeenCalledWith("rotary_device", "", expect.objectContaining({ maxAge: 0 }));
  });

  it("compares OAuth values without accepting different lengths", () => {
    expect(constantTimeEqual("same-value", "same-value")).toBe(true);
    expect(constantTimeEqual("same-value", "same-value-extra")).toBe(false);
  });

  it("requires HTTPS for the production site origin", () => {
    vi.stubEnv("APP_ENV", "production");
    expect(lineSiteUrl).toThrow("must use HTTPS");
  });

  it("rejects a site URL containing query data", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000/?untrusted=value");
    expect(lineSiteUrl).toThrow("site URL is invalid");
  });

  it("accepts only the configured same-origin logout request", () => {
    const valid = new Request("http://localhost:3000/api/auth/line/logout", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
    });
    expect(isSameOriginLineRequest(valid)).toBe(true);

    const invalid = new Request("http://localhost:3000/api/auth/line/logout", {
      method: "POST",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    expect(isSameOriginLineRequest(invalid)).toBe(false);
  });
});
