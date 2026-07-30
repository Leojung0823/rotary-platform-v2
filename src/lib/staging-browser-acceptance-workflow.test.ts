import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/staging-browser-acceptance.yml", "utf8");
const playwrightConfig = readFileSync("e2e/playwright.config.mjs", "utf8");
const stagingTest = readFileSync("e2e/tests/staging-member-acceptance.e2e.mjs", "utf8");

describe("staging browser acceptance workflow safety", () => {
  it("is manual, serialized and protected by the staging environment", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("group: staging-browser-acceptance");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("name: staging");
    expect(workflow).toContain("url: ${{ vars.STAGING_BASE_URL }}");
  });

  it("requires exact main revision confirmation and checks the deployed health revision", () => {
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("STAGING_EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(workflow).toContain("STAGING_ACCEPTANCE_CONFIRMATION: ${{ inputs.confirmation }}");
    expect(workflow).toContain("node scripts/verify-staging-browser-acceptance-inputs.mjs");
    expect(workflow).toContain("E2E_EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(workflow).toContain("TEST-STAGING");
  });

  it("uses environment-scoped staging test credentials without release credentials", () => {
    expect(workflow).toContain("STAGING_TEST_MEMBER_EMAIL: ${{ secrets.STAGING_TEST_MEMBER_EMAIL }}");
    expect(workflow).toContain("STAGING_TEST_MEMBER_PASSWORD: ${{ secrets.STAGING_TEST_MEMBER_PASSWORD }}");
    expect(workflow).toContain("STAGING_EXPECTED_CLUB_NAME: ${{ vars.STAGING_EXPECTED_CLUB_NAME }}");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD");
    expect(workflow).not.toContain("db push");
    expect(workflow).not.toContain("db reset");
  });

  it("disables sensitive browser diagnostics and never uploads artifacts", () => {
    expect(workflow).toContain('E2E_REMOTE: "1"');
    expect(workflow).toContain('E2E_SENSITIVE: "1"');
    expect(workflow).toContain("npm --prefix e2e run test:staging");
    expect(workflow).not.toContain("upload-artifact");
    expect(playwrightConfig).toContain('const remoteRun = process.env.E2E_REMOTE === "1";');
    expect(playwrightConfig).toContain('const sensitiveRun = process.env.E2E_SENSITIVE === "1";');
    expect(playwrightConfig).toContain('trace: sensitiveRun ? "off"');
    expect(playwrightConfig).toContain('screenshot: sensitiveRun ? "off"');
    expect(playwrightConfig).toContain('video: sensitiveRun ? "off"');
    expect(playwrightConfig).toContain("webServer: remoteRun");
    expect(stagingTest).toContain('test.skip(process.env.E2E_REMOTE !== "1"');
  });
});
