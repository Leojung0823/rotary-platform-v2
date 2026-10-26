import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getAuthenticatedUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: mocks.getAuthenticatedUser }));
vi.mock("@/app/auth-actions", () => ({ resetPasswordAction: vi.fn() }));

import ResetPasswordPage from "./page";

const PUBLIC_ORIGIN = "https://rotary-platform-v2-mrha.onrender.com";

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_SERVICE_TYPE", "web");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://0.0.0.0:10000");
    vi.stubEnv("RENDER_EXTERNAL_URL", PUBLIC_ORIGIN);
    mocks.cookies.mockReset().mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
    mocks.getAuthenticatedUser.mockReset().mockResolvedValue(null);
    mocks.redirect.mockReset().mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("redirects an unauthenticated recovery request to the trusted public login", async () => {
    await expect(ResetPasswordPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(`${PUBLIC_ORIGIN}/login?error=recovery_invalid`);
  });

  it("rejects a malformed recovery marker using the trusted public origin", async () => {
    mocks.cookies.mockResolvedValue({ get: vi.fn().mockReturnValue({ value: "not-a-recovery-marker" }) });
    mocks.getAuthenticatedUser.mockResolvedValue({ id: "test-user-id" });

    await expect(ResetPasswordPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(`${PUBLIC_ORIGIN}/login?error=recovery_invalid`);
  });
});
