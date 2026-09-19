import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectStagingLineQuotaAcceptanceInput } from "./staging-line-quota-acceptance.mjs";

const workflow = readFileSync(".github/workflows/staging-line-quota-acceptance.yml", "utf8");
const stagingTest = readFileSync("e2e/tests/staging-line-quota-acceptance.e2e.mjs", "utf8");
const sha = "a".repeat(40);

function validInput() {
  return {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: sha,
    STAGING_EXPECTED_SHA: sha,
    STAGING_LINE_QUOTA_ACCEPTANCE_CONFIRMATION: "TEST-STAGING-LINE-QUOTA",
    STAGING_BASE_URL: "https://staging.example.com",
    STAGING_EXPECTED_CLUB_NAME: "Rotary Platform Staging Test Club",
    STAGING_TEST_OPERATOR_EMAIL: "staging-operator@example.test",
    STAGING_TEST_OPERATOR_PASSWORD: "Rotary-Staging-Operator-2026!",
    STAGING_TEST_MEMBER_EMAIL: "staging-member@example.test",
    STAGING_TEST_MEMBER_PASSWORD: "Rotary-Staging-Member-2026!",
    SUPABASE_PROJECT_REF: "vmmzdautcsgknhyqrsto",
    NEXT_PUBLIC_SUPABASE_URL: "https://vmmzdautcsgknhyqrsto.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-without-printing-it",
    STAGING_LINE_QUOTA_FIXTURE_ID: "quota-12345",
    APP_ENV: "staging",
    TRUSTED_ADMIN_ENVIRONMENT: "staging",
  };
}

describe("protected staging LINE quota acceptance input", () => {
  it("accepts a reserved staging identity and exact main revision", () => {
    const result = inspectStagingLineQuotaAcceptanceInput(validInput());
    expect(result.ok).toBe(true);
    expect(result.commitSha).toBe(sha);
    expect(result.fixtureId).toBe("quota-12345");
    expect(result.errors).toEqual([]);
  });

  it("rejects production, push-triggered, mismatched or real identities", () => {
    const result = inspectStagingLineQuotaAcceptanceInput({
      ...validInput(),
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF_NAME: "feature/test",
      STAGING_EXPECTED_SHA: "b".repeat(40),
      STAGING_TEST_OPERATOR_EMAIL: "real-person@gmail.com",
      APP_ENV: "production",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_LINE_QUOTA_MANUAL_ONLY",
      "STAGING_LINE_QUOTA_MAIN_ONLY",
      "STAGING_EXPECTED_SHA_MISMATCH",
      "STAGING_TEST_OPERATOR_EMAIL_INVALID",
      "STAGING_APP_ENV_REQUIRED",
    ]));
  });
});

describe("staging LINE quota acceptance workflow safety", () => {
  it("is manual-only, serialized, main-gated and staging-protected", () => {
    expect(workflow).toMatch(/^on:\n  workflow_dispatch:/mu);
    expect(workflow).not.toMatch(/^  (push|pull_request|schedule):/mu);
    expect(workflow).toContain("group: staging-line-quota-acceptance");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("name: staging");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
  });

  it("requires exact revision, confirmation and test-only database boundaries", () => {
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("STAGING_EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(workflow).toContain("STAGING_LINE_QUOTA_ACCEPTANCE_CONFIRMATION: ${{ inputs.confirmation }}");
    expect(workflow).toContain("TEST-STAGING-LINE-QUOTA");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
    expect(workflow).toContain("STAGING_TEST_MEMBER_EMAIL: ${{ secrets.STAGING_TEST_MEMBER_EMAIL }}");
    expect(workflow).toContain("STAGING_TEST_MEMBER_PASSWORD: ${{ secrets.STAGING_TEST_MEMBER_PASSWORD }}");
    expect(workflow).toContain("STAGING_LINE_QUOTA_FIXTURE_ID: quota-${{ github.run_id }}");
    expect(workflow).toContain("node scripts/staging-line-quota-acceptance-fixture.mjs seed");
    expect(workflow).toContain("node scripts/staging-line-quota-acceptance-fixture.mjs cleanup");
    expect(workflow).toContain("if: always()");
    const dependenciesStep = workflow.indexOf("- name: Install application dependencies");
    const seedStep = workflow.indexOf("node scripts/staging-line-quota-acceptance-fixture.mjs seed");
    expect(dependenciesStep).toBeGreaterThanOrEqual(0);
    expect(seedStep).toBeGreaterThan(dependenciesStep);
    expect(workflow).not.toContain("db push");
    expect(workflow).not.toContain("db reset");
    expect(workflow).not.toContain("production");
  });

  it("runs a sensitive browser check without retaining diagnostics", () => {
    expect(workflow).toContain('E2E_REMOTE: "1"');
    expect(workflow).toContain('E2E_SENSITIVE: "1"');
    expect(workflow).toContain("npm --prefix e2e run test:staging-line-quota");
    expect(workflow).not.toContain("upload-artifact");
    expect(stagingTest).toContain('test.skip(process.env.E2E_REMOTE !== "1"');
    expect(stagingTest).toContain("expect(health.issues).toEqual([])");
    expect(stagingTest).toContain("LINE 推播已暫停");
  });
});
