import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));
vi.mock("@/lib/site-url", async () => import("../../../lib/site-url"));
vi.mock("@/lib/validation", async () => import("../../../lib/validation"));

import * as route from "./route";

const PUBLIC_ORIGIN = "https://rotary-platform-v2.onrender.com";
const INTERNAL_ORIGIN = "http://0.0.0.0:10000";

function callbackRequest(query: string) {
  return new NextRequest(`${INTERNAL_ORIGIN}/auth/callback?${query}`, {
    headers: {
      host: "0.0.0.0:10000",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "http",
    },
  });
}

function setHostedEnvironment(appEnvironment = "staging") {
  vi.stubEnv("APP_ENV", appEnvironment);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RENDER", "true");
  vi.stubEnv("RENDER_SERVICE_TYPE", "web");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", INTERNAL_ORIGIN);
  vi.stubEnv("RENDER_EXTERNAL_URL", PUBLIC_ORIGIN);
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    setHostedEnvironment();
    mocks.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    mocks.verifyOtp.mockReset().mockResolvedValue({ error: null });
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "test-user-id" } } });
    mocks.createClient.mockReset().mockResolvedValue({
      auth: {
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        verifyOtp: mocks.verifyOtp,
        getUser: mocks.getUser,
      },
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("sends a recovery GET to the public confirmation page without consuming the code", async () => {
    const response = await route.GET(callbackRequest("code=test-only-code&next=/reset-password"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${PUBLIC_ORIGIN}/auth/recovery/confirm?code=test-only-code&next=%2Freset-password`,
    );
    expect(response.headers.get("location")).not.toContain("0.0.0.0");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not inspect an invalid recovery code until the member confirms", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { message: "test-only-auth-error" } });

    const response = await route.GET(callbackRequest("code=invalid-code&next=/reset-password"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${PUBLIC_ORIGIN}/auth/recovery/confirm?code=invalid-code&next=%2Freset-password`,
    );
    expect(response.headers.get("location")).not.toContain("test-only-auth-error");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["", "local"])(
    "uses RENDER_EXTERNAL_URL when APP_ENV is missing or wrong (%s)",
    async (appEnvironment) => {
      setHostedEnvironment(appEnvironment);

      const response = await route.GET(callbackRequest("code=test-only-code&next=/reset-password"));

      expect(response.headers.get("location")).toBe(
        `${PUBLIC_ORIGIN}/auth/recovery/confirm?code=test-only-code&next=%2Freset-password`,
      );
    },
  );

  it("preserves a recovery token for the explicit confirmation POST", async () => {
    const response = await route.GET(callbackRequest(
      "token_hash=test-only-token-hash&type=recovery&next=/reset-password",
    ));

    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      `${PUBLIC_ORIGIN}/auth/recovery/confirm?token_hash=test-only-token-hash&type=recovery&next=%2Freset-password`,
    );
  });

  it("still exchanges non-recovery callbacks on GET", async () => {
    const response = await route.GET(callbackRequest("code=test-only-code&next=/dashboard"));

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("test-only-code");
    expect(response.headers.get("location")).toBe(`${PUBLIC_ORIGIN}/dashboard`);
  });

  it("keeps non-recovery callback failures on the trusted public origin", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { message: "test-only-auth-error" } });

    const response = await route.GET(callbackRequest("code=invalid-code&next=/dashboard"));

    expect(response.headers.get("location")).toBe(`${PUBLIC_ORIGIN}/login?error=recovery_invalid`);
    expect(response.headers.get("location")).not.toContain("test-only-auth-error");
  });

  it("fails closed before Auth work when both hosted origins are invalid", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://192.168.1.5");
    vi.stubEnv("RENDER_EXTERNAL_URL", INTERNAL_ORIGIN);

    await expect(route.GET(callbackRequest("code=test-only-code&next=/reset-password")))
      .rejects.toThrow("Hosted site URL is not configured.");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("keeps local development redirects on localhost", async () => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RENDER", "");
    vi.stubEnv("RENDER_SERVICE_TYPE", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("RENDER_EXTERNAL_URL", "");

    const response = await route.GET(new NextRequest(
      "http://localhost:3000/auth/callback?code=test-only-code&next=/reset-password",
    ));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/recovery/confirm?code=test-only-code&next=%2Freset-password",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
