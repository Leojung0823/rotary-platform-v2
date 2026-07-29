import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookieSet }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createTrustedAdminClient: () => ({
    from: mocks.from.mockImplementation(() => ({ insert: mocks.insert })),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));

import * as route from "./route";

const MOCK_SECRET = "test-only-line-mock-signing-secret-123456";

describe("GET /api/auth/line/start", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("LINE_LOGIN_MODE", "mock");
    vi.stubEnv("LINE_MOCK_SIGNING_SECRET", MOCK_SECRET);
    mocks.cookieSet.mockReset();
    mocks.insert.mockReset().mockResolvedValue({ error: null });
    mocks.from.mockClear();
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "auth-user-id" } } });
    mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("redirects a valid login request to the local signed provider", async () => {
    const response = await route.GET(new NextRequest("http://localhost:3000/api/auth/line/start?returnTo=/dashboard"));
    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/line/mock");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(location.searchParams.get("nonce")).toBeTruthy();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("persists invitation digests and an explicit invitation flow", async () => {
    const invitation = "a".repeat(64);
    await route.GET(new NextRequest(`http://localhost:3000/api/auth/line/start?returnTo=/join&invite=${invitation}`));
    const inserted = mocks.insert.mock.calls[0][0];
    const stateCookie = mocks.cookieSet.mock.calls.find((call) => call[0] === "line_oauth_state")![1];
    const nonceCookie = mocks.cookieSet.mock.calls.find((call) => call[0] === "line_oauth_nonce")![1];
    expect(inserted.state_hash).toBe(createHash("sha256").update(stateCookie).digest("hex"));
    expect(inserted.nonce_hash).toBe(createHash("sha256").update(nonceCookie).digest("hex"));
    expect(inserted.invitation_token_hash).toBe(createHash("sha256").update(invitation).digest("hex"));
    expect(inserted.return_path).toBe("/join");
    expect(inserted.flow_kind).toBe("invitation");
    expect(inserted.initiating_auth_user_id).toBeNull();
  });

  it("requires an active authenticated account before starting a bind flow", async () => {
    await route.GET(new NextRequest("http://localhost:3000/api/auth/line/start?flow=bind&returnTo=/me"));
    expect(mocks.getUser).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("current_account_has_active_access");
    expect(mocks.insert.mock.calls[0][0]).toEqual(expect.objectContaining({
      flow_kind: "bind",
      initiating_auth_user_id: "auth-user-id",
      invitation_token_hash: null,
      return_path: "/me",
    }));
    expect(mocks.cookieSet).toHaveBeenCalledWith("line_flow", "bind", expect.any(Object));
  });

  it("rejects a bind flow when the session has no active access", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const response = await route.GET(new NextRequest("http://localhost:3000/api/auth/line/start?flow=bind"));
    expect(response.headers.get("location")).toContain("line_login_failed");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("sets all OAuth cookies with one ten-minute policy", async () => {
    await route.GET(new NextRequest("http://localhost:3000/api/auth/line/start"));
    const options = mocks.cookieSet.mock.calls.slice(0, 5).map((call) => call[2]);
    expect(new Set(options.map((option) => JSON.stringify(option))).size).toBe(1);
    expect(options[0]).toEqual({ httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge: 600 });
  });

  it("rejects invalid invitation flow and production mock before persistence", async () => {
    await route.GET(new NextRequest("http://localhost:3000/api/auth/line/start?invite=not-a-token"));
    expect(mocks.insert).not.toHaveBeenCalled();

    await route.GET(new NextRequest("http://localhost:3000/api/auth/line/start?flow=unknown"));
    expect(mocks.insert).not.toHaveBeenCalled();

    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://identity.example.com");
    const response = await route.GET(new NextRequest("https://identity.example.com/api/auth/line/start"));
    expect(response.headers.get("location")).toBe("https://identity.example.com/login?error=line_login_failed");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not expose database errors or redirect to provider after persistence failure", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "database-secret-detail" } });
    const response = await route.GET(new NextRequest("http://localhost:3000/api/auth/line/start"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=line_login_failed");
    expect(response.headers.get("location")).not.toContain("database-secret-detail");
  });

  it("replaces an unsafe returnTo with the flow-specific safe default", async () => {
    await route.GET(new NextRequest("http://localhost:3000/api/auth/line/start?flow=bind&returnTo=%252F%252Fevil.example"));
    expect(mocks.insert.mock.calls[0][0].return_path).toBe("/me");
  });

  it("exports no POST start handler", () => {
    expect("POST" in route).toBe(false);
  });
});
