import { describe, expect, it } from "vitest";
import { inspectStagingGoLiveInput } from "./staging-go-live.mjs";

const sha = "a".repeat(40);

function validInput() {
  return {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: sha,
    GITHUB_TOKEN: "g".repeat(40),
    STAGING_EXPECTED_SHA: sha,
    STAGING_PLAN_RUN_ID: "30536951086",
    STAGING_LAUNCH_CONFIRMATION: "LAUNCH-STAGING",
    STAGING_BACKUP_CONFIRMATION: "BACKUP-READY",
    SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    STAGING_BASE_URL: "https://staging.rotary.org",
    STAGING_EXPECTED_CLUB_NAME: "測試扶輪社",
    SUPABASE_ACCESS_TOKEN: "s".repeat(40),
    SUPABASE_DB_PASSWORD: "database-password-2026",
    STAGING_DEPLOY_HOOK_URL: "https://api.deploy.rotary.org/hooks/project-token?branch=main",
    STAGING_TEST_MEMBER_EMAIL: "member@example.test",
    STAGING_TEST_MEMBER_PASSWORD: "Rotary-Staging-Test-2026!",
  };
}

describe("staging go-live input", () => {
  it("accepts an exact protected launch configuration", () => {
    expect(inspectStagingGoLiveInput(validInput())).toMatchObject({
      ok: true,
      commitSha: sha,
      planRunId: "30536951086",
      siteOrigin: "https://staging.rotary.org",
      projectRefSuffix: "qrst",
      deploymentHookConfigured: true,
      credentialsConfigured: true,
      errors: [],
    });
  });

  it("requires manual main execution, exact SHA and explicit confirmations", () => {
    const result = inspectStagingGoLiveInput({
      ...validInput(),
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF_NAME: "feature/test",
      STAGING_EXPECTED_SHA: "b".repeat(40),
      STAGING_LAUNCH_CONFIRMATION: "DEPLOY-STAGING",
      STAGING_BACKUP_CONFIRMATION: "",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_GO_LIVE_MANUAL_ONLY",
      "STAGING_GO_LIVE_MAIN_ONLY",
      "STAGING_EXPECTED_SHA_MISMATCH",
      "STAGING_LAUNCH_CONFIRMATION_MISMATCH",
      "STAGING_BACKUP_CONFIRMATION_MISMATCH",
    ]));
  });

  it("rejects non-public site and deployment hook targets", () => {
    for (const [name, value] of [
      ["STAGING_BASE_URL", "https://169.254.169.254"],
      ["STAGING_BASE_URL", "https://staging.example"],
      ["STAGING_DEPLOY_HOOK_URL", "https://10.0.0.8/hooks/token"],
      ["STAGING_DEPLOY_HOOK_URL", "http://deploy.rotary.org/hooks/token"],
    ]) {
      const result = inspectStagingGoLiveInput({ ...validInput(), [name]: value });
      expect(result.ok).toBe(false);
      expect(result.errors.some((error) => error.startsWith(name))).toBe(true);
    }
  });

  it("rejects missing protected credentials without returning values", () => {
    const secret = "do-not-print-this-secret";
    const result = inspectStagingGoLiveInput({
      ...validInput(),
      SUPABASE_ACCESS_TOKEN: "",
      SUPABASE_DB_PASSWORD: "short",
      STAGING_DEPLOY_HOOK_URL: secret,
      STAGING_TEST_MEMBER_PASSWORD: "short",
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
