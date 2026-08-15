import { describe, expect, it } from "vitest";
import { inspectDeploymentEnvironment } from "./deployment-env.mjs";

const localEnvironment = {
  APP_ENV: "local",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key",
  TRUSTED_ADMIN_ENVIRONMENT: "",
  LINE_LOGIN_MODE: "mock",
  LINE_MOCK_SIGNING_SECRET: "a".repeat(64),
  LINE_OA_MODE: "mock",
};

const stagingEnvironment = {
  ...localEnvironment,
  APP_ENV: "staging",
  NEXT_PUBLIC_SITE_URL: "https://staging.rotary.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://staging-project.supabase.co",
  TRUSTED_ADMIN_ENVIRONMENT: "staging",
  LINE_LOGIN_MODE: "line",
  LINE_LOGIN_CHANNEL_ID: "1234567890",
  LINE_LOGIN_CHANNEL_SECRET: "staging-channel-secret",
  LINE_LOGIN_CALLBACK_URL: "https://staging.rotary.example.com/api/auth/line/callback",
};

describe("deployment environment validation", () => {
  it("accepts a complete local mock environment", () => {
    expect(inspectDeploymentEnvironment(localEnvironment)).toMatchObject({ ok: true, environment: "local" });
  });

  it("accepts a hosted staging environment with an exact trusted boundary", () => {
    expect(inspectDeploymentEnvironment(stagingEnvironment)).toMatchObject({
      ok: true,
      environment: "staging",
      hosted: true,
      errors: [],
    });
  });

  it("records staging mock LINE OA as a non-blocking deployment warning", () => {
    const report = inspectDeploymentEnvironment({
      ...stagingEnvironment,
      LINE_OA_MODE: "mock",
    });
    expect(report.ok).toBe(true);
    expect(report.warnings).toContain("STAGING_LINE_OA_IS_MOCK");
  });

  it("rejects public staging over HTTP or with a local Supabase URL", () => {
    const report = inspectDeploymentEnvironment({
      ...stagingEnvironment,
      NEXT_PUBLIC_SITE_URL: "http://staging.rotary.example.com",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    });
    expect(report.errors).toContain("NEXT_PUBLIC_SITE_URL_HTTPS_REQUIRED");
    expect(report.errors).toContain("NEXT_PUBLIC_SUPABASE_URL_HTTPS_REQUIRED");
    expect(report.errors).toContain("NEXT_PUBLIC_SUPABASE_URL_PUBLIC_HOST_REQUIRED");
  });

  it("rejects private, reserved and single-label hosted origins", () => {
    for (const NEXT_PUBLIC_SITE_URL of [
      "https://staging",
      "https://printer.local",
      "https://10.0.0.8",
      "https://192.0.2.5",
      "https://[fd00::1]",
    ]) {
      const report = inspectDeploymentEnvironment({ ...stagingEnvironment, NEXT_PUBLIC_SITE_URL });
      expect(report.errors, NEXT_PUBLIC_SITE_URL).toContain("NEXT_PUBLIC_SITE_URL_PUBLIC_HOST_REQUIRED");
    }

    const report = inspectDeploymentEnvironment({
      ...stagingEnvironment,
      NEXT_PUBLIC_SUPABASE_URL: "https://192.168.1.5",
      LINE_LOGIN_CALLBACK_URL: "https://[::1]/api/auth/line/callback",
    });
    expect(report.errors).toEqual(expect.arrayContaining([
      "NEXT_PUBLIC_SUPABASE_URL_PUBLIC_HOST_REQUIRED",
      "LINE_LOGIN_CALLBACK_URL_PUBLIC_HOST_REQUIRED",
    ]));
  });

  it("rejects a mismatched trusted admin boundary", () => {
    const report = inspectDeploymentEnvironment({
      ...stagingEnvironment,
      TRUSTED_ADMIN_ENVIRONMENT: "production",
    });
    expect(report.errors).toContain("TRUSTED_ADMIN_ENVIRONMENT_MISMATCH");
  });

  it("rejects mock LINE Login on a hosted environment", () => {
    const report = inspectDeploymentEnvironment({
      ...stagingEnvironment,
      LINE_LOGIN_MODE: "mock",
    });
    expect(report.errors).toContain("HOSTED_LINE_LOGIN_MUST_USE_LINE");
  });

  it("requires the LINE callback to match the exact application callback", () => {
    const report = inspectDeploymentEnvironment({
      ...stagingEnvironment,
      LINE_LOGIN_CALLBACK_URL: "https://staging.rotary.example.com/wrong-callback",
    });
    expect(report.errors).toContain("LINE_LOGIN_CALLBACK_URL_MISMATCH");
  });

  it("rejects short credentials and credentials containing whitespace", () => {
    const report = inspectDeploymentEnvironment({
      ...stagingEnvironment,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "short",
      SUPABASE_SERVICE_ROLE_KEY: "service role key contains spaces",
      LINE_LOGIN_CHANNEL_SECRET: "short",
    });
    expect(report.errors).toEqual(expect.arrayContaining([
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY_INVALID",
      "SUPABASE_SERVICE_ROLE_KEY_INVALID",
      "LINE_LOGIN_CHANNEL_SECRET_INVALID",
    ]));
  });

  it("warns when local-only bootstrap credentials remain in hosted runtime", () => {
    const report = inspectDeploymentEnvironment({
      ...stagingEnvironment,
      BOOTSTRAP_SUPERADMIN_PASSWORD: "temporary-hosted-bootstrap-password",
      VERIFY_OPERATOR_PASSWORD: "local-verification-password",
    });
    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual(expect.arrayContaining([
      "HOSTED_BOOTSTRAP_PASSWORD_REMOVE_AFTER_USE",
      "HOSTED_VERIFY_OPERATOR_PASSWORD_LOCAL_ONLY",
    ]));
  });

  it("does not expose any credential values in its report", () => {
    const secret = "never-print-this-secret";
    const report = inspectDeploymentEnvironment({
      ...stagingEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: secret,
      LINE_LOGIN_CHANNEL_SECRET: secret,
    });
    expect(JSON.stringify(report)).not.toContain(secret);
  });
});
