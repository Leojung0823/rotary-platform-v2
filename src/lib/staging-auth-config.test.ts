import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildStagingAuthConfigPatch,
  inspectStagingAuthConfig,
  inspectStagingAuthConfigInput,
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

  it("keeps the workflow protected and staging-only", () => {
    expect(workflow).toContain("environment: staging");
    expect(workflow).toContain("SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}");
    expect(workflow).toContain("node scripts/sync-staging-auth-config.mjs");
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD");
    expect(workflow).not.toContain("production");
  });
});
