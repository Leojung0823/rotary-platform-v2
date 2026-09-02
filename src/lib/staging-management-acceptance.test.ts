import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectStagingManagementAcceptanceInput } from "./staging-management-acceptance.mjs";

const workflow = readFileSync(".github/workflows/staging-management-acceptance.yml", "utf8");
const stagingTest = readFileSync("e2e/tests/staging-management-acceptance.e2e.mjs", "utf8");
const sha = "a".repeat(40);

function validInput() {
  return {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: sha,
    STAGING_EXPECTED_SHA: sha,
    STAGING_MANAGEMENT_ACCEPTANCE_CONFIRMATION: "TEST-STAGING-MANAGEMENT",
    STAGING_BASE_URL: "https://staging.example.com",
    STAGING_TEST_OPERATOR_EMAIL: "staging-operator@example.test",
    STAGING_TEST_OPERATOR_PASSWORD: "Rotary-Staging-Operator-2026!",
    STAGING_EXPECTED_CLUB_NAME: "Rotary Platform Staging Test Club",
  };
}

describe("staging management acceptance input", () => {
  it("accepts a reserved staging operator identity and exact main revision", () => {
    const result = inspectStagingManagementAcceptanceInput(validInput());
    expect(result.ok).toBe(true);
    expect(result.commitSha).toBe(sha);
    expect(result.siteOrigin).toBe("https://staging.example.com");
    expect(result.credentialsConfigured).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects non-test operator identities and invalid credentials", () => {
    const result = inspectStagingManagementAcceptanceInput({
      ...validInput(),
      STAGING_TEST_OPERATOR_EMAIL: "real-person@gmail.com",
      STAGING_TEST_OPERATOR_PASSWORD: "short",
      STAGING_EXPECTED_CLUB_NAME: "Real Rotary Club",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_TEST_OPERATOR_EMAIL_INVALID",
      "STAGING_TEST_OPERATOR_PASSWORD_INVALID",
      "STAGING_EXPECTED_CLUB_NAME_INVALID",
    ]));
  });

  it("requires manual main acceptance with an exact revision and confirmation", () => {
    const result = inspectStagingManagementAcceptanceInput({
      ...validInput(),
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_REF_NAME: "feature/test",
      STAGING_EXPECTED_SHA: "b".repeat(40),
      STAGING_MANAGEMENT_ACCEPTANCE_CONFIRMATION: "TEST-STAGING",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_MANAGEMENT_ACCEPTANCE_MANUAL_ONLY",
      "STAGING_MANAGEMENT_ACCEPTANCE_MAIN_ONLY",
      "STAGING_EXPECTED_SHA_MISMATCH",
      "STAGING_MANAGEMENT_ACCEPTANCE_CONFIRMATION_MISMATCH",
    ]));
  });

  it("requires a public credential-free HTTPS origin", () => {
    for (const STAGING_BASE_URL of [
      "http://staging.example.com",
      "https://user:pass@staging.example.com",
      "https://staging.example.com/app",
      "https://127.0.0.1",
    ]) {
      const result = inspectStagingManagementAcceptanceInput({ ...validInput(), STAGING_BASE_URL });
      expect(result.ok, STAGING_BASE_URL).toBe(false);
    }
  });
});

describe("staging management acceptance workflow safety", () => {
  it("is manual-only, serialized, main-gated and protected by staging", () => {
    expect(workflow).toMatch(/^on:\n  workflow_dispatch:/mu);
    expect(workflow).not.toMatch(/^  (push|pull_request|schedule):/mu);
    expect(workflow).toContain("group: staging-management-acceptance");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("name: staging");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
  });

  it("requires the exact deployed revision and protected confirmation", () => {
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("STAGING_EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(workflow).toContain("STAGING_MANAGEMENT_ACCEPTANCE_CONFIRMATION: ${{ inputs.confirmation }}");
    expect(workflow).toContain("node scripts/verify-staging-management-acceptance-inputs.mjs");
    expect(workflow).toContain("E2E_EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(workflow).toContain("TEST-STAGING-MANAGEMENT");
  });

  it("passes only staging operator credentials to the browser step", () => {
    expect(workflow).toContain("STAGING_TEST_OPERATOR_EMAIL: ${{ secrets.STAGING_TEST_OPERATOR_EMAIL }}");
    expect(workflow).toContain("STAGING_TEST_OPERATOR_PASSWORD: ${{ secrets.STAGING_TEST_OPERATOR_PASSWORD }}");
    expect(workflow).toContain("STAGING_EXPECTED_CLUB_NAME: ${{ vars.STAGING_EXPECTED_CLUB_NAME }}");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD");
    expect(workflow).not.toContain("upload-artifact");
    expect(workflow).toContain('E2E_REMOTE: "1"');
    expect(workflow).toContain('E2E_SENSITIVE: "1"');
    expect(workflow).toContain("npm --prefix e2e run test:staging-management");
  });

  it("covers the non-member operator path and only disposable archive mutations", () => {
    expect(stagingTest).toContain('page.getByRole("link", { name: backToMemberName })');
    expect(stagingTest).toContain('page.getByTestId("management-card-birthday-collection")');
    expect(stagingTest).toContain('page.getByRole("button", { name: "建立／重跑本月任務" })');
    expect(stagingTest).toContain('page.getByTestId("management-card-archives")');
    expect(stagingTest).toContain('name: "handover-acceptance.txt"');
    expect(stagingTest).not.toContain("confirmArchiveHandoverAction");
    expect(stagingTest).toContain('expect(health.issues).toEqual([])');
  });
});
