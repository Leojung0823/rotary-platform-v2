import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/admin", () => ({ createTrustedAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  }),
}));
vi.mock("@/lib/site-url", async () => import("../lib/site-url"));
vi.mock("@/lib/validation", async () => import("../lib/validation"));

import { requestPasswordResetAction } from "./auth-actions";

describe("requestPasswordResetAction", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_SERVICE_TYPE", "web");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://0.0.0.0:10000");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://rotary-platform-v2.onrender.com");
    mocks.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
    mocks.redirect.mockReset().mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("gives Supabase the public recovery callback when the container origin is internal", async () => {
    const formData = new FormData();
    formData.set("email", "test-member@example.test");

    await expect(requestPasswordResetAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("test-member@example.test", {
      redirectTo: "https://rotary-platform-v2.onrender.com/auth/callback?next=%2Freset-password",
    });
    expect(mocks.redirect).toHaveBeenCalledWith("/forgot-password?success=sent");
  });
});
