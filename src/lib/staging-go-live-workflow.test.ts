import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/staging-go-live.yml", "utf8");
const projectIdentityScript = readFileSync("scripts/verify-staging-project-identity.mjs", "utf8");

describe("staging go-live workflow safety", () => {
  it("is manual-only, serialized, main-gated and protected by the staging environment", () => {
    expect(workflow).toMatch(/^on:\n  workflow_dispatch:/mu);
    expect(workflow).not.toMatch(/^  (push|pull_request|schedule):/mu);
    expect(workflow).toContain("group: staging-go-live");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("name: staging");
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow).toContain("node scripts/verify-staging-go-live-inputs.mjs");
  });

  it("requires the protected launch inputs and the exact checked-out SHA", () => {
    for (const input of [
      "expected_sha",
      "plan_run_id",
      "confirmation",
      "backup_confirmation",
      "provision_test_data",
      "provisioning_confirmation",
    ]) {
      expect(workflow).toContain(`      ${input}:`);
    }
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).toContain("STAGING_EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(workflow).toContain("E2E_EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(workflow).toContain("LAUNCH-STAGING");
    expect(workflow).toContain("BACKUP-READY");
    expect(workflow).toContain("PROVISION-STAGING-TEST-DATA");
  });

  it("uses only the permissions needed to read code and plan-run metadata", () => {
    expect(workflow).toMatch(/permissions:\n  contents: read\n  actions: read/u);
    expect(workflow).not.toMatch(/permissions:\s+write/u);
  });

  it("validates the plan and repository guards before linking or mutating staging", () => {
    const inputGate = workflow.indexOf("node scripts/verify-staging-go-live-inputs.mjs");
    const planGate = workflow.indexOf("node scripts/verify-staging-plan-run.mjs");
    const migrationChecks = workflow.indexOf("npm run check:migrations");
    const projectIdentity = workflow.indexOf("node scripts/verify-staging-project-identity.mjs");
    const link = workflow.indexOf('supabase link --project-ref "$SUPABASE_PROJECT_REF"');
    expect(inputGate).toBeGreaterThan(-1);
    expect(planGate).toBeGreaterThan(inputGate);
    expect(migrationChecks).toBeGreaterThan(planGate);
    expect(projectIdentity).toBeGreaterThan(migrationChecks);
    expect(link).toBeGreaterThan(projectIdentity);
  });

  it("performs one dry-run before one apply and never resets or loads a seed", () => {
    const dryRun = workflow.indexOf("supabase db push --linked --dry-run");
    const apply = workflow.indexOf("supabase db push --linked\n");
    expect(dryRun).toBeGreaterThan(-1);
    expect(apply).toBeGreaterThan(dryRun);
    expect(workflow.match(/supabase db push --linked\n/gu)).toHaveLength(1);
    expect(workflow).not.toContain("db reset");
    expect(workflow).not.toContain("--include-seed");
    expect(workflow).not.toContain("--include-all");
  });

  it("keeps the deployment hook secret, bounded and separate from readiness", () => {
    expect(workflow).toContain("STAGING_DEPLOY_HOOK: ${{ secrets.STAGING_DEPLOY_HOOK }}");
    expect(workflow).not.toContain("STAGING_DEPLOY_HOOK: ${{ vars.STAGING_DEPLOY_HOOK }}");
    const trigger = workflow.indexOf("node scripts/trigger-staging-deploy.mjs");
    const wait = workflow.indexOf("node scripts/wait-for-staging-revision.mjs");
    const smoke = workflow.indexOf("npm run smoke:staging");
    const acceptance = workflow.indexOf("npm --prefix e2e run test:staging");
    expect(trigger).toBeGreaterThan(-1);
    expect(wait).toBeGreaterThan(trigger);
    expect(smoke).toBeGreaterThan(wait);
    expect(acceptance).toBeGreaterThan(smoke);
  });

  it("orders apply, optional provisioning, deploy, smoke and acceptance", () => {
    const apply = workflow.indexOf("supabase db push --linked\n");
    const provision = workflow.indexOf("node scripts/provision-staging-test-data.mjs\n");
    const deploy = workflow.indexOf("node scripts/trigger-staging-deploy.mjs");
    const smoke = workflow.indexOf("npm run smoke:staging");
    const acceptance = workflow.indexOf("npm --prefix e2e run test:staging");
    expect(provision).toBeGreaterThan(apply);
    expect(deploy).toBeGreaterThan(provision);
    expect(smoke).toBeGreaterThan(deploy);
    expect(acceptance).toBeGreaterThan(smoke);
  });

  it("does not upload protected browser artifacts or print credential variables", () => {
    expect(workflow).not.toContain("actions/upload-artifact");
    expect(workflow).not.toMatch(/echo.*(?:PASSWORD|TOKEN|DEPLOY_HOOK|PROJECT_REF)/u);
    expect(workflow).not.toContain("STAGING_DEPLOY_HOOK_URL");
  });

  it("scopes every secret to only the steps that need it", () => {
    const jobEnvironment = workflow.slice(
      workflow.indexOf("    env:"),
      workflow.indexOf("    steps:"),
    );
    expect(jobEnvironment).not.toContain("secrets.");
    expect(jobEnvironment).not.toContain("github.token");
    expect(workflow).toContain("SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}");
    expect(workflow).toContain("STAGING_DEPLOY_HOOK: ${{ secrets.STAGING_DEPLOY_HOOK }}");
    expect(workflow).toContain("STAGING_TEST_MEMBER_PASSWORD: ${{ secrets.STAGING_TEST_MEMBER_PASSWORD }}");
    expect(jobEnvironment).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("limits service-role to skipped-by-default provisioning steps", () => {
    expect(workflow.match(/SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/gu)).toHaveLength(2);
    const preflight = workflow.slice(
      workflow.indexOf("- name: Validate optional initial provisioning credentials"),
      workflow.indexOf("- name: Link the exact staging Supabase project"),
    );
    const provision = workflow.slice(
      workflow.indexOf("- name: Provision or confirm initial staging test data"),
      workflow.indexOf("- name: Trigger the protected staging deployment hook"),
    );
    for (const step of [preflight, provision]) {
      expect(step).toContain("if: inputs.provision_test_data == true");
      expect(step).toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
    }
  });

  it("requires production inventory without logging staging project identifiers", () => {
    expect(workflow).toContain("PRODUCTION_SUPABASE_PROJECT_REF: ${{ vars.PRODUCTION_SUPABASE_PROJECT_REF }}");
    expect(workflow).toContain("PRODUCTION_SUPABASE_PROJECT_REFS: ${{ vars.PRODUCTION_SUPABASE_PROJECT_REFS }}");
    expect(workflow).toContain("PRODUCTION_SUPABASE_URL: ${{ vars.PRODUCTION_SUPABASE_URL }}");
    expect(workflow).toContain("PRODUCTION_SUPABASE_URLS: ${{ vars.PRODUCTION_SUPABASE_URLS }}");
    expect(projectIdentityScript).not.toContain("projectRefSuffix");
    expect(projectIdentityScript).not.toContain("supabaseOrigin");
  });

  it("does not weaken migration, reset, seed, revision, smoke or acceptance gates", () => {
    expect(workflow).not.toContain("db reset");
    expect(workflow).not.toContain("--include-seed");
    expect(workflow.match(/supabase db push --linked\n/gu)).toHaveLength(1);
    expect(workflow).toContain("node scripts/verify-staging-plan-run.mjs");
    expect(workflow).toContain("BACKUP-READY");
    expect(workflow).toContain("node scripts/wait-for-staging-revision.mjs");
    expect(workflow).toContain("npm run smoke:staging");
    expect(workflow).toContain("npm --prefix e2e run test:staging");
  });
});
