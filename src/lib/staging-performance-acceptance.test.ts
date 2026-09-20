import { describe, expect, it } from "vitest";
import {
  inspectStagingPerformanceAcceptanceInput,
  MAX_SAMPLE_COUNT,
  MIN_SAMPLE_COUNT,
  PERFORMANCE_CONFIRMATION,
} from "./staging-performance-acceptance.mjs";

const sha = "a".repeat(40);

function validInput() {
  return {
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF_NAME: "main",
    GITHUB_SHA: sha,
    STAGING_EXPECTED_SHA: "b".repeat(40),
    STAGING_PERFORMANCE_CONFIRMATION: PERFORMANCE_CONFIRMATION,
    STAGING_PERFORMANCE_SAMPLE_COUNT: "3",
    STAGING_PERFORMANCE_CACHE_MODE: "warm",
    STAGING_BASE_URL: "https://staging.example.com",
    STAGING_TEST_MEMBER_EMAIL: "member@example.test",
    STAGING_TEST_MEMBER_PASSWORD: "Rotary-Staging-Member-2026!",
    STAGING_TEST_OPERATOR_EMAIL: "operator@example.test",
    STAGING_TEST_OPERATOR_PASSWORD: "Rotary-Staging-Operator-2026!",
    STAGING_EXPECTED_CLUB_NAME: "測試扶輪社",
  };
}

describe("staging performance acceptance input", () => {
  it("accepts a manual main run against an ancestor staging revision", () => {
    const result = inspectStagingPerformanceAcceptanceInput(validInput());
    expect(result.ok).toBe(true);
    expect(result.workflowSha).toBe(sha);
    expect(result.expectedSha).toBe("b".repeat(40));
    expect(result.sampleCount).toBe(3);
    expect(result.cacheMode).toBe("warm");
    expect(result.credentialsConfigured).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects non-manual, non-main or unsafe confirmation inputs", () => {
    const result = inspectStagingPerformanceAcceptanceInput({
      ...validInput(),
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF_NAME: "feature/perf",
      STAGING_PERFORMANCE_CONFIRMATION: "DEPLOY-PRODUCTION",
      STAGING_PERFORMANCE_SAMPLE_COUNT: "0",
      STAGING_TEST_OPERATOR_EMAIL: "member@example.test",
      STAGING_TEST_OPERATOR_PASSWORD: "short",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_PERFORMANCE_MANUAL_ONLY",
      "STAGING_PERFORMANCE_MAIN_ONLY",
      "STAGING_PERFORMANCE_CONFIRMATION_MISMATCH",
      "STAGING_PERFORMANCE_SAMPLE_COUNT_OUT_OF_RANGE",
      "STAGING_TEST_OPERATOR_PASSWORD_INVALID",
      "STAGING_PERFORMANCE_IDENTITIES_MUST_DIFFER",
    ]));
  });

  it("bounds the repeat count and rejects credentials with newlines", () => {
    for (const sampleCount of [String(MIN_SAMPLE_COUNT - 1), String(MAX_SAMPLE_COUNT + 1), "abc"]) {
      const result = inspectStagingPerformanceAcceptanceInput({
        ...validInput(),
        STAGING_PERFORMANCE_SAMPLE_COUNT: sampleCount,
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([
        sampleCount === "abc"
          ? "STAGING_PERFORMANCE_SAMPLE_COUNT_INVALID"
          : "STAGING_PERFORMANCE_SAMPLE_COUNT_OUT_OF_RANGE",
      ]));
    }

    const result = inspectStagingPerformanceAcceptanceInput({
      ...validInput(),
      STAGING_TEST_MEMBER_PASSWORD: "Rotary-Test-2026!\nleak",
    });
    expect(result.errors).toContain("STAGING_TEST_MEMBER_PASSWORD_INVALID");
  });

  it("requires an explicit cold or warm cache condition", () => {
    const result = inspectStagingPerformanceAcceptanceInput({
      ...validInput(),
      STAGING_PERFORMANCE_CACHE_MODE: "mixed",
    });
    expect(result.ok).toBe(false);
    expect(result.cacheMode).toBeNull();
    expect(result.errors).toContain("STAGING_PERFORMANCE_CACHE_MODE_INVALID");
  });

  it("requires a public credential-free HTTPS origin", () => {
    for (const STAGING_BASE_URL of [
      "http://staging.example.com",
      "https://user:pass@staging.example.com",
      "https://staging.example.com/app",
    ]) {
      const result = inspectStagingPerformanceAcceptanceInput({ ...validInput(), STAGING_BASE_URL });
      expect(result.ok, STAGING_BASE_URL).toBe(false);
      expect(result.errors, STAGING_BASE_URL).toContain("STAGING_BASE_URL_HTTPS_ORIGIN_REQUIRED");
    }

    const privateHost = inspectStagingPerformanceAcceptanceInput({
      ...validInput(),
      STAGING_BASE_URL: "https://127.0.0.1",
    });
    expect(privateHost.ok).toBe(false);
    expect(privateHost.errors).toContain("STAGING_BASE_URL_PUBLIC_HOST_REQUIRED");
  });
});
