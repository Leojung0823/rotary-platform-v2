import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const manualWorkflow = readFileSync(".github/workflows/browser-smoke.yml", "utf8");
const stagingReleaseWorkflow = readFileSync(".github/workflows/staging-release.yml", "utf8");
const stagingGoLiveWorkflow = readFileSync(".github/workflows/staging-go-live.yml", "utf8");
const smokeWorkflows = [ciWorkflow, manualWorkflow];

describe("browser smoke workflow security", () => {
  it("does not keep reusable test passwords in the repository", () => {
    for (const workflow of smokeWorkflows) {
      expect(workflow).not.toMatch(/E2E_ADMIN_PASSWORD:\s+\S+/u);
      expect(workflow).not.toMatch(/E2E_ROLE_PASSWORD:\s+\S+/u);
      expect(workflow).not.toMatch(/VERIFY_OPERATOR_PASSWORD=Rotary-/u);
      expect(workflow).toContain("Generate ephemeral local E2E credentials");
      expect(workflow).toContain('echo "::add-mask::$admin_password"');
      expect(workflow).toContain('echo "::add-mask::$role_password"');
      expect(workflow).toContain('echo "::add-mask::$operator_password"');
    }
  });

  it("enables birthday flags before creating their authenticated fixtures", () => {
    for (const workflow of smokeWorkflows) {
      const enableIndex = workflow.indexOf("Enable birthday fixture flags through the protected RPC");
      const fixtureIndex = workflow.indexOf("Create local role-shell browser fixtures");
      expect(enableIndex).toBeGreaterThan(-1);
      expect(fixtureIndex).toBeGreaterThan(enableIndex);
    }
  });

  it("runs the PR smoke check in CI only after the change-scope and database jobs pass", () => {
    expect(ciWorkflow).toContain("group: ${{ github.workflow }}-${{ github.ref }}");
    expect(ciWorkflow).toContain("cancel-in-progress: true");
    expect(ciWorkflow).toMatch(/member-browser-smoke:\n\s+name: member-browser-smoke\n\s+needs: \[change-scope, database\]/u);
    expect(ciWorkflow).toContain("if: needs.change-scope.outputs.run_full == 'true'");
  });

  it("keeps a serialized manual fallback, not a second automatic PR or push workflow", () => {
    expect(manualWorkflow).toMatch(/^on:\n  workflow_dispatch:\n/mu);
    expect(manualWorkflow).not.toMatch(/^  (?:pull_request|push):/mu);
    expect(manualWorkflow).toContain("group: ${{ github.workflow }}-${{ github.ref }}");
    expect(manualWorkflow).toContain("cancel-in-progress: true");
  });

  it("overrides setup-cli with public ECR for every local start and reset", () => {
    const ciDatabase = ciWorkflow.slice(ciWorkflow.indexOf("  database:\n"), ciWorkflow.indexOf("  member-browser-smoke:\n"));
    const ciSmoke = ciWorkflow.slice(ciWorkflow.indexOf("  member-browser-smoke:\n"));
    const manualSmoke = manualWorkflow.slice(manualWorkflow.indexOf("  member-browser-smoke:\n"));
    for (const job of [ciDatabase, ciSmoke, manualSmoke]) {
      const setup = job.indexOf("uses: supabase/setup-cli@v2");
      const override = job.indexOf("SUPABASE_INTERNAL_IMAGE_REGISTRY=public.ecr.aws' >> \"$GITHUB_ENV\"");
      const start = job.indexOf("- name: Start local Supabase");
      const reset = job.indexOf("- name: Reset ");
      expect(setup).toBeGreaterThan(-1);
      expect(job).toContain("version: 2.84.2");
      expect(override).toBeGreaterThan(setup);
      expect(start).toBeGreaterThan(override);
      expect(reset).toBeGreaterThan(start);
      expect(job.slice(start, reset)).toContain("SUPABASE_INTERNAL_IMAGE_REGISTRY: public.ecr.aws");
      const nextStep = job.indexOf("      - name:", reset + 1);
      const resetStep = nextStep === -1 ? job.slice(reset) : job.slice(reset, nextStep);
      expect(resetStep).toContain("SUPABASE_INTERNAL_IMAGE_REGISTRY: public.ecr.aws");
      expect(resetStep).toContain("Supabase image registry: $SUPABASE_INTERNAL_IMAGE_REGISTRY");
    }
  });

  it("does not couple CI cancellation to the separately serialized staging release workflows", () => {
    expect(stagingReleaseWorkflow).toContain("group: staging-release");
    expect(stagingReleaseWorkflow).toContain("cancel-in-progress: false");
    expect(stagingReleaseWorkflow).toContain("if: github.ref == 'refs/heads/main' && inputs.operation == 'plan'");
    expect(stagingGoLiveWorkflow).toContain("group: staging-go-live");
    expect(stagingGoLiveWorkflow).toContain("cancel-in-progress: false");
    expect(stagingGoLiveWorkflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(stagingGoLiveWorkflow).toContain("STAGING_EXPECTED_SHA: ${{ inputs.expected_sha }}");
    expect(stagingGoLiveWorkflow).toContain("node scripts/verify-staging-go-live-inputs.mjs");
  });
});
