import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildStagingAuthConfigPatch,
  buildStagingRecoveryEmailPatch,
  buildStagingRedirectPatch,
  inspectStagingAuthConfig,
  inspectStagingAuthConfigInput,
  inspectStagingRecoveryEmailConfig,
  inspectStagingRedirectConfig,
  isEmailTemplatePlanRestriction,
  REQUIRED_RECOVERY_REDIRECTS,
  STAGING_AUTH_ORIGIN,
} from "./staging-auth-config.mjs";

const template = '<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=recovery&amp;next=/reset-password">確認</a>';
const projectRef = "abcdefghijklmnopqrst";
const workflow = readFileSync(".github/workflows/repair-staging-auth-redirect.yml", "utf8");

function validInput() {
  return {
    APP_ENV: "staging",
    TRUSTED_ADMIN_ENVIRONMENT: "staging",
    SUPABASE_PROJECT_REF: projectRef,
    SUPABASE_ACCESS_TOKEN: "staging-management-token".padEnd(40, "x"),
    STAGING_BASE_URL: STAGING_AUTH_ORIGIN,
  };
}

describe("protected staging Auth configuration", () => {
  it("accepts only the approved staging origin and environment", () => {
    expect(inspectStagingAuthConfigInput(validInput())).toEqual({ ok: true, errors: [] });
    expect(inspectStagingAuthConfigInput({ ...validInput(), APP_ENV: "production" }).errors)
      .toContain("STAGING_APP_ENV_REQUIRED");
    expect(inspectStagingAuthConfigInput({ ...validInput(), STAGING_BASE_URL: "https://rotary-platform-v2.onrender.com" }).errors)
      .toContain("STAGING_BASE_URL_NOT_APPROVED");
  });

  it("preserves existing redirects and adds both recovery callbacks", () => {
    const patch = buildStagingAuthConfigPatch({
      current: { uri_allow_list: "https://existing.example.test/callback" },
      recoveryTemplate: template,
    });
    expect(patch).toMatchObject({
      site_url: STAGING_AUTH_ORIGIN,
      mailer_subjects_recovery: "扶輪平台密碼重設",
      mailer_templates_recovery_content: template,
    });
    expect(patch.uri_allow_list.split(",")).toEqual(expect.arrayContaining([
      "https://existing.example.test/callback",
      ...REQUIRED_RECOVERY_REDIRECTS,
    ]));
  });

  it("rejects the default confirmation URL template", () => {
    expect(() => buildStagingAuthConfigPatch({
      recoveryTemplate: '<a href="{{ .ConfirmationURL }}">重設</a>',
    })).toThrow("RECOVERY_TEMPLATE_CALLBACK_INVALID");
  });

  it("verifies the hosted values without returning any credential", () => {
    const config = buildStagingAuthConfigPatch({ recoveryTemplate: template });
    const result = inspectStagingAuthConfig({ config, recoveryTemplate: template });
    expect(result).toEqual({ ok: true, errors: [] });
    expect(JSON.stringify(result)).not.toContain("management-token");
  });

  it("names a token carrying characters that fetch would forward verbatim", () => {
    // U+00A0 is the failure this guard exists for: it survives into the
    // Authorization header and the hosted API answers an opaque 401.
    expect(inspectStagingAuthConfigInput({
      ...validInput(),
      SUPABASE_ACCESS_TOKEN: `\u00a0${validInput().SUPABASE_ACCESS_TOKEN}`,
    })).toEqual({ ok: true, errors: [] });
    expect(inspectStagingAuthConfigInput({
      ...validInput(),
      SUPABASE_ACCESS_TOKEN: `  ${validInput().SUPABASE_ACCESS_TOKEN}\n`,
    })).toEqual({ ok: true, errors: [] });
    expect(inspectStagingAuthConfigInput({
      ...validInput(),
      SUPABASE_ACCESS_TOKEN: validInput().SUPABASE_ACCESS_TOKEN.replace("x", "\u00a0"),
    }).errors).toContain("SUPABASE_ACCESS_TOKEN_HAS_UNEXPECTED_CHARACTERS");
    expect(inspectStagingAuthConfigInput({ ...validInput(), SUPABASE_ACCESS_TOKEN: "short" }).errors)
      .toContain("SUPABASE_ACCESS_TOKEN_INVALID");
  });

  it("keeps the workflow protected and staging-only", () => {
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}");
    expect(workflow).toContain("node scripts/sync-staging-auth-config.mjs");
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD");
    expect(workflow).not.toContain("production");
  });
});

const syncScript = readFileSync("scripts/sync-staging-auth-config.mjs", "utf8");
const planRefusal = JSON.stringify({
  message: "Email template modification is not available for free tier projects using the default email provider. Please upgrade your plan or configure a custom SMTP provider.",
});

describe("staging Auth patch split by plan restriction", () => {
  it("keeps the redirect patch free of the plan-restricted email fields", () => {
    const patch = buildStagingRedirectPatch({
      current: { uri_allow_list: "https://existing.example.test/callback" },
    });
    expect(patch).toMatchObject({ site_url: STAGING_AUTH_ORIGIN });
    expect(patch).not.toHaveProperty("mailer_subjects_recovery");
    expect(patch).not.toHaveProperty("mailer_templates_recovery_content");
    expect(patch.uri_allow_list.split(",")).toEqual(expect.arrayContaining([
      "https://existing.example.test/callback",
      ...REQUIRED_RECOVERY_REDIRECTS,
    ]));
  });

  it("carries only the email fields in the recovery email patch", () => {
    expect(buildStagingRecoveryEmailPatch({ recoveryTemplate: template })).toEqual({
      mailer_subjects_recovery: "扶輪平台密碼重設",
      mailer_templates_recovery_content: template,
    });
    expect(() => buildStagingRecoveryEmailPatch({
      recoveryTemplate: '<a href="{{ .ConfirmationURL }}">重設</a>',
    })).toThrow("RECOVERY_TEMPLATE_CALLBACK_INVALID");
  });

  it("enforces redirects independently of the email template", () => {
    const config = buildStagingRedirectPatch();
    expect(inspectStagingRedirectConfig({ config })).toEqual({ ok: true, errors: [] });
    expect(inspectStagingRedirectConfig({ config: { ...config, site_url: "https://evil.example.test" } }).errors)
      .toContain("STAGING_SITE_URL_MISMATCH");
    expect(inspectStagingRedirectConfig({ config: { ...config, uri_allow_list: "" } }).errors)
      .toContain("STAGING_RECOVERY_REDIRECT_MISSING");
    // A missing template must not weaken the redirect verdict.
    expect(inspectStagingRedirectConfig({ config }).ok).toBe(true);
    expect(inspectStagingRecoveryEmailConfig({ config, recoveryTemplate: template }).ok).toBe(false);
  });

  it("recognises only the free tier email template refusal", () => {
    expect(isEmailTemplatePlanRestriction(400, planRefusal)).toBe(true);
    // Any other 400 must stay a hard failure, or the sync would silently pass.
    expect(isEmailTemplatePlanRestriction(400, JSON.stringify({ message: "invalid uri_allow_list entry" }))).toBe(false);
    expect(isEmailTemplatePlanRestriction(400, "")).toBe(false);
    // The same wording on a different status is not a plan restriction.
    expect(isEmailTemplatePlanRestriction(403, planRefusal)).toBe(false);
    expect(isEmailTemplatePlanRestriction(500, planRefusal)).toBe(false);
  });

  it("fails the run on any refusal that is not the plan restriction", () => {
    expect(syncScript).toContain("isEmailTemplatePlanRestriction");
    // The redirect stage has no tolerant branch: it goes through request(),
    // which throws on every non-2xx response.
    expect(syncScript).toContain('label: "patch_redirects"');
    expect(syncScript).toMatch(/if \(!redirectResult\.ok\) fail\(/u);
    // The tolerant branch is reached only after the plan check, and the final
    // else still calls fail().
    expect(syncScript).toContain("} else {\n  const detail = describeValidationFailure(emailResponse");
    // Diagnostics must never describe an auth failure body.
    expect(syncScript).toContain("if (![400, 422].includes(status)) return \"\";");
  });
});
