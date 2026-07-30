import { describe, expect, it } from "vitest";
import { inspectDeploymentReadiness } from "./deployment-readiness";

const localEnvironment = {
  APP_ENV: "local",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key-123456",
  SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key-123456",
  LINE_LOGIN_MODE: "mock",
  LINE_MOCK_SIGNING_SECRET: "local-mock-signing-secret-at-least-32-characters",
  LINE_OA_MODE: "mock",
};

const stagingEnvironment = {
  ...localEnvironment,
  APP_ENV: "staging",
  TRUSTED_ADMIN_ENVIRONMENT: "staging",
  NEXT_PUBLIC_SITE_URL: "https://staging.rotary-platform.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://rotary-staging.supabase.co",
};

const productionEnvironment = {
  ...stagingEnvironment,
  APP_ENV: "production",
  TRUSTED_ADMIN_ENVIRONMENT: "production",
  NEXT_PUBLIC_SITE_URL: "https://members.rotary-platform.example",
  NEXT_PUBLIC_SUPABASE_URL: "https://rotary-production.supabase.co",
  LINE_LOGIN_MODE: "line",
  LINE_LOGIN_CHANNEL_ID: "1234567890",
  LINE_LOGIN_CHANNEL_SECRET: "production-line-channel-secret",
  LINE_LOGIN_CALLBACK_URL: "https://members.rotary-platform.example/api/auth/line/callback",
  LINE_OA_MODE: "line",
};

describe("deployment readiness", () => {
  it("accepts the explicit local mock boundary", () => {
    const result = inspectDeploymentReadiness(localEnvironment);
    expect(result.ready).toBe(true);
    expect(result.environment).toBe("local");
    expect(result.errors).toEqual([]);
  });

  it("accepts hosted staging with HTTPS and exact trusted boundary", () => {
    const result = inspectDeploymentReadiness(stagingEnvironment);
    expect(result.ready).toBe(true);
    expect(result.warnings).toContain("LINE_LOGIN_MODE_staging_mock_only");
    expect(result.summary.siteOrigin).toBe("https://staging.rotary-platform.example");
  });

  it("rejects hosted HTTP, localhost and a mismatched admin boundary", () => {
    const result = inspectDeploymentReadiness({
      ...stagingEnvironment,
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      TRUSTED_ADMIN_ENVIRONMENT: "production",
    });
    expect(result.ready).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "NEXT_PUBLIC_SITE_URL_https_required",
      "NEXT_PUBLIC_SITE_URL_hosted_origin_required",
      "NEXT_PUBLIC_SUPABASE_URL_https_required",
      "NEXT_PUBLIC_SUPABASE_URL_hosted_origin_required",
      "TRUSTED_ADMIN_ENVIRONMENT_mismatch",
    ]));
  });

  it("requires real LINE modes in production", () => {
    const result = inspectDeploymentReadiness({
      ...productionEnvironment,
      LINE_LOGIN_MODE: "mock",
      LINE_OA_MODE: "mock",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "LINE_LOGIN_MODE_production_requires_line",
      "LINE_OA_MODE_production_requires_line",
    ]));
  });

  it("accepts production only with an exact HTTPS LINE callback", () => {
    expect(inspectDeploymentReadiness(productionEnvironment).ready).toBe(true);
    const mismatch = inspectDeploymentReadiness({
      ...productionEnvironment,
      LINE_LOGIN_CALLBACK_URL: "https://members.rotary-platform.example/api/auth/line/wrong",
    });
    expect(mismatch.errors).toContain("LINE_LOGIN_CALLBACK_URL_mismatch");
  });

  it("never places supplied secrets in validation errors", () => {
    const secret = "do-not-print-this-secret-value";
    const result = inspectDeploymentReadiness({
      ...productionEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: secret,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret,
    });
    expect(result.errors.join(" ")).not.toContain(secret);
    expect(result.errors).toContain("SUPABASE_KEYS_must_differ");
  });
});
