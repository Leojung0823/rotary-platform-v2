import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyChangedPaths,
  isHighRiskPath,
} from "../../.github/scripts/classify-change-scope.mjs";

const workflows = [
  ".github/workflows/ci.yml",
  ".github/workflows/quality.yml",
  ".github/workflows/browser-smoke.yml",
].map((path) => ({ path, source: readFileSync(path, "utf8") }));

describe("CI change scope policy", () => {
  it("skips full gates for documentation-only changes", () => {
    expect(classifyChangedPaths([
      "docs/product/DEVELOPMENT_ROADMAP.md",
      "README.md",
    ])).toMatchObject({
      runFull: false,
      reason: "docs_or_metadata_only",
    });
  });

  it("runs full gates for runtime, data, and workflow changes", () => {
    for (const path of [
      "src/app/dashboard/page.tsx",
      "supabase/migrations/20260831000100_example.sql",
      ".github/workflows/ci.yml",
      "new-build-system.toml",
    ]) {
      expect(isHighRiskPath(path), path).toBe(true);
    }
  });

  it("fails open when no changed files can be identified", () => {
    expect(classifyChangedPaths([])).toMatchObject({
      runFull: true,
      reason: "no_changed_paths_fail_open",
    });
  });

  it("adds the scope gate before each heavy workflow job", () => {
    for (const { source } of workflows) {
      expect(source).toContain("change-scope:");
      expect(source).toContain("run_full: ${{ steps.scope.outputs.run_full }}");
      expect(source).toContain("needs: change-scope");
      expect(source).toContain("if: needs.change-scope.outputs.run_full == 'true'");
      expect(source).toContain("classify-change-scope.mjs");
    }
  });
});
