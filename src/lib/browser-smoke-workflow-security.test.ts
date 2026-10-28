import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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

  it("uses GHCR authentication with an isolated anonymous fallback before every local start", () => {
    const ciDatabase = ciWorkflow.slice(ciWorkflow.indexOf("  database:\n"), ciWorkflow.indexOf("  member-browser-smoke:\n"));
    const ciSmoke = ciWorkflow.slice(ciWorkflow.indexOf("  member-browser-smoke:\n"));
    const manualSmoke = manualWorkflow.slice(manualWorkflow.indexOf("  member-browser-smoke:\n"));
    for (const job of [ciDatabase, ciSmoke, manualSmoke]) {
      const setup = job.indexOf("uses: supabase/setup-cli@v2");
      const override = job.indexOf("SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io' >> \"$GITHUB_ENV\"");
      const login = job.indexOf("uses: docker/login-action@v3");
      const report = job.indexOf("- name: Report GHCR authentication or fall back to anonymous");
      const start = job.indexOf("- name: Start local Supabase");
      const reset = job.indexOf("- name: Reset ");
      expect(setup).toBeGreaterThan(-1);
      expect(job).toContain("version: 2.84.2");
      expect(job).toContain("packages: read");
      expect(job).toContain("contents: read");
      expect(override).toBeGreaterThan(setup);
      expect(login).toBeGreaterThan(override);
      expect(report).toBeGreaterThan(login);
      expect(start).toBeGreaterThan(report);
      expect(reset).toBeGreaterThan(start);
      const loginStep = job.slice(job.lastIndexOf("- name: Log in to GHCR", login), report);
      expect(loginStep).toContain("continue-on-error: true");
      expect(loginStep).toContain("registry: ghcr.io");
      expect(loginStep).toContain("username: ${{ github.actor }}");
      expect(loginStep).toContain("password: ${{ secrets.GITHUB_TOKEN }}");
      expect(job.slice(report, start)).toContain("steps.ghcr_login.outcome");
      expect(job.slice(report, start)).toContain("supabase-anonymous.XXXXXX");
      expect(job.slice(start, reset)).toContain("SUPABASE_INTERNAL_IMAGE_REGISTRY: ghcr.io");
      const nextStep = job.indexOf("      - name:", reset + 1);
      const resetStep = nextStep === -1 ? job.slice(reset) : job.slice(reset, nextStep);
      expect(resetStep).toContain("SUPABASE_INTERNAL_IMAGE_REGISTRY: ghcr.io");
      expect(resetStep).toContain("Supabase image registry: $SUPABASE_INTERNAL_IMAGE_REGISTRY");
    }
  });

  it("falls back to an empty Docker configuration when login fails", () => {
    const jobs = [
      ciWorkflow.slice(ciWorkflow.indexOf("  database:\n"), ciWorkflow.indexOf("  member-browser-smoke:\n")),
      ciWorkflow.slice(ciWorkflow.indexOf("  member-browser-smoke:\n")),
      manualWorkflow.slice(manualWorkflow.indexOf("  member-browser-smoke:\n")),
    ];
    for (const job of jobs) {
      const section = job.slice(job.indexOf("      - name: Report GHCR authentication or fall back to anonymous"));
      const scriptStart = section.indexOf("        run: |\n") + "        run: |\n".length;
      const scriptEnd = section.indexOf("\n      - name:", scriptStart);
      expect(scriptStart).toBeGreaterThan("        run: |\n".length - 1);
      expect(scriptEnd).toBeGreaterThan(scriptStart);
      const script = section.slice(scriptStart, scriptEnd).split("\n").map((line) => line.replace(/^ {10}/u, "")).join("\n");
      const root = mkdtempSync(join(tmpdir(), "rotary-ghcr-fallback-"));
      try {
        const githubEnv = join(root, "github-env");
        writeFileSync(githubEnv, "");
        const failure = spawnSync("bash", ["-e", "-c", script], {
          encoding: "utf8",
          env: { ...process.env, GHCR_LOGIN_OUTCOME: "failure", RUNNER_TEMP: root, GITHUB_ENV: githubEnv },
        });
        expect(failure.status).toBe(0);
        expect(failure.stdout).toContain("using anonymous Docker configuration");
        const entry = readFileSync(githubEnv, "utf8").trim();
        expect(entry).toMatch(/^DOCKER_CONFIG=/u);
        expect(readdirSync(entry.slice("DOCKER_CONFIG=".length))).toEqual([]);
        writeFileSync(githubEnv, "");
        const success = spawnSync("bash", ["-e", "-c", script], {
          encoding: "utf8",
          env: { ...process.env, GHCR_LOGIN_OUTCOME: "success", RUNNER_TEMP: root, GITHUB_ENV: githubEnv },
        });
        expect(success.status).toBe(0);
        expect(success.stdout).toContain("Docker login succeeded");
        expect(readFileSync(githubEnv, "utf8")).toBe("");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
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
