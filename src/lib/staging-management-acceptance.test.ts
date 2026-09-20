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
    STAGING_TEST_MEMBER_EMAIL: "staging-member@example.test",
    STAGING_TEST_MEMBER_PASSWORD: "Rotary-Staging-Member-2026!",
    STAGING_EXPECT_NEGATIVE_ROLES: "false",
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
    expect(result.negativeRoleMatrixRequested).toBe(false);
    expect(result.negativeRoleCredentialsConfigured).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it("rejects non-test identities and invalid credentials", () => {
    const result = inspectStagingManagementAcceptanceInput({
      ...validInput(),
      STAGING_TEST_OPERATOR_EMAIL: "real-person@gmail.com",
      STAGING_TEST_OPERATOR_PASSWORD: "short",
      STAGING_TEST_MEMBER_EMAIL: "real-member@gmail.com",
      STAGING_TEST_MEMBER_PASSWORD: "short",
      STAGING_EXPECTED_CLUB_NAME: "Real Rotary Club",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_TEST_OPERATOR_EMAIL_INVALID",
      "STAGING_TEST_OPERATOR_PASSWORD_INVALID",
      "STAGING_TEST_MEMBER_EMAIL_INVALID",
      "STAGING_TEST_MEMBER_PASSWORD_INVALID",
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

  it("does not accept one account for both operator and member roles", () => {
    const result = inspectStagingManagementAcceptanceInput({
      ...validInput(),
      STAGING_TEST_MEMBER_EMAIL: validInput().STAGING_TEST_OPERATOR_EMAIL,
    });
    expect(result.errors).toContain("STAGING_TEST_IDENTITIES_MUST_DIFFER");
  });

  it("requires three distinct reserved test identities when the negative matrix is enabled", () => {
    const result = inspectStagingManagementAcceptanceInput({
      ...validInput(),
      STAGING_EXPECT_NEGATIVE_ROLES: "true",
      STAGING_TEST_SUSPENDED_EMAIL: "staging-suspended@example.test",
      STAGING_TEST_SUSPENDED_PASSWORD: "Rotary-Staging-Suspended-2026!",
      STAGING_TEST_ENDED_EMAIL: "staging-ended@example.test",
      STAGING_TEST_ENDED_PASSWORD: "Rotary-Staging-Ended-2026!",
      STAGING_TEST_OUTSIDER_SECRETARY_EMAIL: "staging-outsider-secretary@example.test",
      STAGING_TEST_OUTSIDER_SECRETARY_PASSWORD: "Rotary-Staging-Outsider-2026!",
    });
    expect(result.ok).toBe(true);
    expect(result.negativeRoleMatrixRequested).toBe(true);
    expect(result.negativeRoleCredentialsConfigured).toBe(true);
  });

  it("rejects a partial or duplicated negative role identity set", () => {
    const result = inspectStagingManagementAcceptanceInput({
      ...validInput(),
      STAGING_EXPECT_NEGATIVE_ROLES: "true",
      STAGING_TEST_SUSPENDED_EMAIL: "staging-suspended@example.test",
      STAGING_TEST_SUSPENDED_PASSWORD: "short",
      STAGING_TEST_ENDED_EMAIL: "staging-suspended@example.test",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_TEST_SUSPENDED_PASSWORD_INVALID",
      "STAGING_TEST_ENDED_PASSWORD_INVALID",
      "STAGING_TEST_OUTSIDER_SECRETARY_EMAIL_INVALID",
      "STAGING_TEST_OUTSIDER_SECRETARY_PASSWORD_INVALID",
      "STAGING_NEGATIVE_ROLE_IDENTITIES_MUST_DIFFER",
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

  it("passes only staging test identities to the browser step", () => {
    expect(workflow).toContain("STAGING_TEST_OPERATOR_EMAIL: ${{ secrets.STAGING_TEST_OPERATOR_EMAIL }}");
    expect(workflow).toContain("STAGING_TEST_OPERATOR_PASSWORD: ${{ secrets.STAGING_TEST_OPERATOR_PASSWORD }}");
    expect(workflow).toContain("STAGING_TEST_MEMBER_EMAIL: ${{ secrets.STAGING_TEST_MEMBER_EMAIL }}");
    expect(workflow).toContain("STAGING_TEST_MEMBER_PASSWORD: ${{ secrets.STAGING_TEST_MEMBER_PASSWORD }}");
    expect(workflow).toContain("expect_negative_roles:");
    expect(workflow).toContain("STAGING_EXPECT_NEGATIVE_ROLES: ${{ inputs.expect_negative_roles }}");
    expect(workflow).toContain("STAGING_TEST_SUSPENDED_EMAIL: ${{ secrets.STAGING_TEST_SUSPENDED_EMAIL }}");
    expect(workflow).toContain("STAGING_TEST_ENDED_EMAIL: ${{ secrets.STAGING_TEST_ENDED_EMAIL }}");
    expect(workflow).toContain("STAGING_TEST_OUTSIDER_SECRETARY_EMAIL: ${{ secrets.STAGING_TEST_OUTSIDER_SECRETARY_EMAIL }}");
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

  it("covers service-plan draft isolation, publish visibility, and retraction", () => {
    expect(stagingTest).toContain('STAGING_TEST_MEMBER_EMAIL');
    expect(stagingTest).toContain('`/clubs/${servicePlanClubId}/members?mode=member`');
    expect(stagingTest).toContain('memberPage.getByRole("heading", { name: "無法存取", exact: true })');
    expect(stagingTest).toContain('本年度的服務計劃尚未發布。');
    expect(stagingTest).toContain('發布給社員');
    expect(stagingTest).toContain('社員服務');
    expect(stagingTest).toContain('儲存草稿');
  });

  it("covers disposable finance mutations without adding service credentials", () => {
    expect(stagingTest).toContain('社費管理頁完成部分收款、代墊與核銷');
    expect(stagingTest).toContain("expectFinanceDownloads");
    expect(stagingTest).toContain("memberExport.status()).toBe(403)");
    expect(stagingTest).toContain('產生年度應收');
    expect(stagingTest).toContain('部分收款');
    expect(stagingTest).toContain('核銷已登錄。');
    expect(stagingTest).toContain('staging 驗收資料回收');
    expect(workflow).toContain('Disposable finance year partial receipt');
    expect(workflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it("keeps the E-10 negative role matrix explicitly opt-in", () => {
    expect(stagingTest).toContain('test.skip(!negativeRoleMatrixRequested');
    expect(stagingTest).toContain('loginExpectingAccessDenied');
    expect(stagingTest).toContain('const accessDeniedHeading = /^(無法存取|帳號目前未啟用|目前沒有有效社籍)$/u;');
    expect(stagingTest).toContain('targetManagementUrl');
    expect(stagingTest).toContain('outsiderPage.getByRole("heading", { level: 1 })');
  });
});
