import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/staging-release.yml", "utf8");

describe("staging release workflow safety", () => {
  it("is manual, serialized and protected by the staging environment", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("group: staging-release");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("name: staging");
    expect(workflow).toContain("url: ${{ vars.STAGING_BASE_URL }}");
  });

  it("checks out and confirms the immutable main revision", () => {
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("STAGING_EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(workflow).toContain("STAGING_CONFIRMATION: ${{ inputs.confirmation }}");
    expect(workflow).toContain("node scripts/verify-staging-release-inputs.mjs");
    expect(workflow).toContain("DEPLOY-STAGING");
  });

  it("uses environment-scoped Supabase credentials without printing them", () => {
    expect(workflow).toContain("SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}");
    expect(workflow).toContain("SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}");
    expect(workflow).toContain("SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}");
    expect(workflow).not.toContain("echo \"$SUPABASE_ACCESS_TOKEN\"");
    expect(workflow).not.toContain("echo \"$SUPABASE_DB_PASSWORD\"");
  });

  it("always performs a dry-run before an apply and never resets or seeds remote data", () => {
    const dryRunIndex = workflow.indexOf("supabase db push --linked --dry-run");
    const applyIndex = workflow.indexOf("supabase db push --linked\n");
    expect(dryRunIndex).toBeGreaterThan(-1);
    expect(applyIndex).toBeGreaterThan(dryRunIndex);
    expect(workflow).toContain("if: inputs.operation == 'apply'");
    expect(workflow).not.toContain("db reset");
    expect(workflow).not.toContain("--include-seed");
  });

  it("requires HTTPS smoke verification after applying migrations", () => {
    expect(workflow).toContain("npm run smoke:staging");
    expect(workflow).toContain("STAGING_EXPECT_ENV: staging");
    expect(workflow).toContain("Staging smoke test did not pass after 12 attempts");
  });
});
