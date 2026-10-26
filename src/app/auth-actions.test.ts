import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: mocks.cookieGet,
    set: mocks.cookieSet,
    delete: mocks.cookieDelete,
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/admin", () => ({ createTrustedAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      verifyOtp: mocks.verifyOtp,
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
  }),
}));
vi.mock("@/lib/site-url", async () => import("../lib/site-url"));
vi.mock("@/lib/validation", async () => import("../lib/validation"));

import {
  confirmPasswordRecoveryAction,
  requestPasswordResetAction,
  resetPasswordAction,
} from "./auth-actions";

describe("requestPasswordResetAction", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_SERVICE_TYPE", "web");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://0.0.0.0:10000");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://rotary-platform-v2.onrender.com");
    mocks.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
    mocks.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    mocks.verifyOtp.mockReset().mockResolvedValue({ error: null });
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "test-user-id" } } });
    mocks.cookieSet.mockReset();
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
    expect(mocks.redirect).toHaveBeenCalledWith(
      "https://rotary-platform-v2.onrender.com/forgot-password?success=sent",
    );
  });
});

describe("confirmPasswordRecoveryAction", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_SERVICE_TYPE", "web");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://0.0.0.0:10000");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://rotary-platform-v2.onrender.com");
    mocks.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    mocks.verifyOtp.mockReset().mockResolvedValue({ error: null });
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "test-user-id" } } });
    mocks.cookieSet.mockReset();
    mocks.redirect.mockReset().mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("consumes a PKCE code only after the confirmation form is submitted", async () => {
    const formData = new FormData();
    formData.set("code", "test-only-code");

    await expect(confirmPasswordRecoveryAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("test-only-code");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.cookieSet).toHaveBeenCalledWith("rotary_recovery", expect.stringMatching(/^[0-9a-f]{48}$/u), {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 15 * 60,
    });
    expect(mocks.redirect).toHaveBeenCalledWith("https://rotary-platform-v2.onrender.com/reset-password");
  });

  it("preserves the token-hash recovery flow", async () => {
    const formData = new FormData();
    formData.set("tokenHash", "test-only-token-hash");
    formData.set("type", "recovery");

    await expect(confirmPasswordRecoveryAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      type: "recovery",
      token_hash: "test-only-token-hash",
    });
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("fails on the public login page when the confirmed credential is invalid", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { message: "test-only-auth-error" } });
    const formData = new FormData();
    formData.set("code", "invalid-code");

    await expect(confirmPasswordRecoveryAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      "https://rotary-platform-v2.onrender.com/login?error=recovery_invalid",
    );
  });

  it("fails closed before Auth work for a malformed confirmation", async () => {
    await expect(confirmPasswordRecoveryAction(new FormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith(
      "https://rotary-platform-v2.onrender.com/login?error=recovery_invalid",
    );
  });
});

describe("resetPasswordAction", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RENDER", "true");
    vi.stubEnv("RENDER_SERVICE_TYPE", "web");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://0.0.0.0:10000");
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://rotary-platform-v2.onrender.com");
    mocks.cookieGet.mockReset().mockReturnValue({ value: "a".repeat(48) });
    mocks.cookieSet.mockReset();
    mocks.cookieDelete.mockReset();
    mocks.updateUser.mockReset().mockResolvedValue({ error: null });
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: "test-user-id" } } });
    mocks.redirect.mockReset().mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uses the trusted origin for missing recovery authorization", async () => {
    mocks.cookieGet.mockReturnValue(undefined);

    await expect(resetPasswordAction(new FormData())).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "https://rotary-platform-v2.onrender.com/login?error=recovery_invalid",
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("uses the trusted origin when password validation fails", async () => {
    const formData = new FormData();
    formData.set("password", "long-enough-password");
    formData.set("passwordConfirmation", "different-password");

    await expect(resetPasswordAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "https://rotary-platform-v2.onrender.com/reset-password?error=invalid_password",
    );
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("uses the trusted origin when Supabase rejects the new password", async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: "test-only-auth-error" } });
    const formData = new FormData();
    formData.set("password", "long-enough-password");
    formData.set("passwordConfirmation", "long-enough-password");

    await expect(resetPasswordAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.redirect).toHaveBeenCalledWith(
      "https://rotary-platform-v2.onrender.com/reset-password?error=invalid_password",
    );
    expect(mocks.cookieDelete).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("uses the trusted origin after updating the password and globally signing out", async () => {
    const formData = new FormData();
    formData.set("password", "long-enough-password");
    formData.set("passwordConfirmation", "long-enough-password");

    await expect(resetPasswordAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "long-enough-password" });
    expect(mocks.cookieDelete).toHaveBeenCalledWith("rotary_recovery");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "https://rotary-platform-v2.onrender.com/login?success=password_updated",
    );
  });
});
