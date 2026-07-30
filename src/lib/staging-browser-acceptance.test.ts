import { describe, expect, it } from "vitest";
import { inspectStagingBrowserAcceptanceInput } from "./staging-browser-acceptance.mjs";

const sha = "a".repeat(40);

function validInput() {
  return {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: sha,
    STAGING_EXPECTED_SHA: sha,
    STAGING_ACCEPTANCE_CONFIRMATION: "TEST-STAGING",
    STAGING_BASE_URL: "https://staging.example.com",
    STAGING_TEST_MEMBER_EMAIL: "member@example.test",
    STAGING_TEST_MEMBER_PASSWORD: "Rotary-Staging-Test-2026!",
    STAGING_EXPECTED_CLUB_NAME: "測試扶輪社",
  };
}

describe("staging browser acceptance input", () => {
  it("accepts an exact main revision and protected test account", () => {
    const result = inspectStagingBrowserAcceptanceInput(validInput());
    expect(result.ok).toBe(true);
    expect(result.commitSha).toBe(sha);
    expect(result.siteOrigin).toBe("https://staging.example.com");
    expect(result.credentialsConfigured).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects non-manual, non-main or mismatched revisions", () => {
    const result = inspectStagingBrowserAcceptanceInput({
      ...validInput(),
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REF_NAME: "feature/test",
      STAGING_EXPECTED_SHA: "b".repeat(40),
      STAGING_ACCEPTANCE_CONFIRMATION: "DEPLOY-STAGING",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_ACCEPTANCE_MANUAL_ONLY",
      "STAGING_ACCEPTANCE_MAIN_ONLY",
      "STAGING_EXPECTED_SHA_MISMATCH",
      "STAGING_ACCEPTANCE_CONFIRMATION_MISMATCH",
    ]));
  });

  it("requires a public HTTPS origin without path or credentials", () => {
    for (const STAGING_BASE_URL of [
      "http://staging.example.com",
      "https://localhost",
      "https://user:pass@staging.example.com",
      "https://staging.example.com/app",
      "https://127.1.2.3",
      "https://10.0.0.8",
      "https://169.254.1.2",
      "https://172.20.0.5",
      "https://192.168.1.5",
      "https://[::1]",
      "https://[fd00::1]",
      "https://printer.local",
    ]) {
      const result = inspectStagingBrowserAcceptanceInput({ ...validInput(), STAGING_BASE_URL });
      expect(result.ok).toBe(false);
      expect(result.errors).toContain("STAGING_BASE_URL_PUBLIC_HOST_REQUIRED");
    }
  });

  it("rejects missing or malformed staging test identity settings", () => {
    const result = inspectStagingBrowserAcceptanceInput({
      ...validInput(),
      STAGING_TEST_MEMBER_EMAIL: "not-an-email",
      STAGING_TEST_MEMBER_PASSWORD: "short",
      STAGING_EXPECTED_CLUB_NAME: "",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_TEST_MEMBER_EMAIL_INVALID",
      "STAGING_TEST_MEMBER_PASSWORD_INVALID",
      "STAGING_EXPECTED_CLUB_NAME_INVALID",
    ]));
  });
});
