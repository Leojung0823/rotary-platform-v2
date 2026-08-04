import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { proxy, shouldRefreshAuthSession } from "./proxy";

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
});
