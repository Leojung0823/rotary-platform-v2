import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compareStagingPerformanceResults,
  inspectStagingPerformanceComparisonInput,
} from "./staging-performance-comparison.mjs";

const workflow = readFileSync(".github/workflows/staging-performance-comparison.yml", "utf8");
const baselineSha = "a".repeat(40);
const restoreSha = "b".repeat(40);

function validInput() {
  return {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: restoreSha,
    STAGING_BASELINE_SHA: baselineSha,
    STAGING_RESTORE_SHA: restoreSha,
    STAGING_PERFORMANCE_COMPARISON_CONFIRMATION: "TEST-STAGING-PERFORMANCE-COMPARISON",
    STAGING_ROLLBACK_CONFIRMATION: "STAGING-CODE-ROLLBACK-READY",
    STAGING_BASE_URL: "https://staging.example.com",
    STAGING_EXPECTED_CLUB_NAME: "測試扶輪社",
    STAGING_PERFORMANCE_SAMPLE_COUNT: "5",
    STAGING_PERFORMANCE_CACHE_MODE: "warm",
    STAGING_TEST_MEMBER_EMAIL: "member@example.test",
    STAGING_TEST_MEMBER_PASSWORD: "Rotary-Staging-Test-2026!",
    STAGING_TEST_OPERATOR_EMAIL: "operator@example.test",
    STAGING_TEST_OPERATOR_PASSWORD: "Rotary-Staging-Operator-2026!",
  };
}

function result(expectedSha: string, offset: number) {
  return {
    expectedSha,
    cacheMode: "warm",
    routes: [
      {
        label: "member-dashboard",
        samples: [
          { lcpMs: 100 + offset, fcpMs: 50 + offset, ttfbMs: 40 + offset, inpMs: 16 },
          { lcpMs: 120 + offset, fcpMs: 60 + offset, ttfbMs: 50 + offset, inpMs: 20 },
          { lcpMs: 110 + offset, fcpMs: 55 + offset, ttfbMs: 45 + offset, inpMs: null },
        ],
      },
    ],
  };
}

describe("staging performance comparison", () => {
  it("accepts a code-only comparison with separate baseline and restore revisions", () => {
    const inspected = inspectStagingPerformanceComparisonInput(validInput());
    expect(inspected.ok).toBe(true);
    expect(inspected.baselineSha).toBe(baselineSha);
    expect(inspected.restoreSha).toBe(restoreSha);
    expect(inspected.errors).toEqual([]);
  });

  it("rejects unsafe or ambiguous comparison inputs", () => {
    const inspected = inspectStagingPerformanceComparisonInput({
      ...validInput(),
      GITHUB_REF_NAME: "feature/test",
      STAGING_RESTORE_SHA: baselineSha,
      STAGING_ROLLBACK_CONFIRMATION: "BACKUP-READY",
    });
    expect(inspected.errors).toEqual(expect.arrayContaining([
      "STAGING_PERFORMANCE_COMPARISON_MAIN_ONLY",
      "STAGING_BASELINE_AND_RESTORE_MUST_DIFFER",
      "STAGING_ROLLBACK_CONFIRMATION_MISMATCH",
    ]));
  });

  it("compares medians without inventing an unavailable INP value", () => {
    const comparison = compareStagingPerformanceResults(
      result(baselineSha, 0),
      result(restoreSha, -20),
    );
    expect(comparison.cacheMode).toBe("warm");
    expect(comparison.routes[0].metrics.lcpMs).toMatchObject({
      beforeMs: 110,
      afterMs: 90,
      deltaMs: -20,
    });
    expect(comparison.routes[0].metrics.inpMs).toMatchObject({
      beforeMs: 18,
      afterMs: 18,
      deltaMs: 0,
    });
  });

  it("rejects mixed cache conditions and route drift", () => {
    expect(() => compareStagingPerformanceResults(
      result(baselineSha, 0),
      { ...result(restoreSha, 0), cacheMode: "cold" },
    )).toThrow("CACHE_MODE_MISMATCH");

    expect(() => compareStagingPerformanceResults(
      result(baselineSha, 0),
      { ...result(restoreSha, 0), routes: [{ ...result(restoreSha, 0).routes[0], label: "other-route" }] },
    )).toThrow("ROUTE_SET_MISMATCH");
  });

  it("deploys only to staging and always restores after the baseline transition", () => {
    expect(workflow).toContain("name: staging");
    expect(workflow).toContain("if: always() && steps.baseline_transition.outcome == 'success'");
    expect(workflow).toContain("node scripts/trigger-staging-deploy.mjs");
    expect(workflow).toContain("STAGING_ROLLBACK_CONFIRMATION");
    expect(workflow).not.toContain("supabase db push");
    expect(workflow).not.toContain("supabase db reset");
    expect(workflow).not.toContain("PRODUCTION");
  });
});
