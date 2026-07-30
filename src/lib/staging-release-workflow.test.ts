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

  it("checks out the immutable main revision and is plan-only", () => {
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main' && inputs.operation == 'plan'");
    expect(workflow).toContain("node scripts/verify-staging-release-inputs.mjs");
    expect(workflow).not.toContain("DEPLOY-STAGING");
  });

  it("uses environment-scoped Supabase credentials without printing them", () => {
    expect(workflow).toContain("SUPABASE_PROJECT_REF: ${{ vars.SUPABASE_PROJECT_REF }}");
    expect(workflow).toContain("SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}");
    expect(workflow).toContain("SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}");
    expect(workflow).not.toContain("echo \"$SUPABASE_ACCESS_TOKEN\"");
    expect(workflow).not.toContain("echo \"$SUPABASE_DB_PASSWORD\"");
    const jobEnvironment = workflow.slice(
      workflow.indexOf("    env:"),
      workflow.indexOf("    steps:"),
    );
    expect(jobEnvironment).not.toContain("secrets.");
  });

  it("performs a dry-run and never applies, resets or seeds remote data", () => {
    expect(workflow).toContain("supabase db push --linked --dry-run");
    expect(workflow).not.toContain("supabase db push --linked\n");
    expect(workflow).not.toContain("db reset");
    expect(workflow).not.toContain("--include-seed");
  });

  it("keeps staging identity explicit without performing deployment acceptance", () => {
    expect(workflow).toContain("STAGING_EXPECT_ENV: staging");
    expect(workflow).not.toContain("npm run smoke:staging");
    expect(workflow).not.toContain("STAGING_DEPLOY_HOOK");
  });
});
