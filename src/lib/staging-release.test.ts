import { describe, expect, it } from "vitest";
import { inspectStagingReleaseInput } from "./staging-release.mjs";

const valid = {
  GITHUB_REF_NAME: "main",
  STAGING_OPERATION: "plan",
  STAGING_CONFIRMATION: "",
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  STAGING_BASE_URL: "https://staging.rotary.example",
};

describe("staging release input", () => {
  it("accepts a main-branch migration plan", () => {
    expect(inspectStagingReleaseInput(valid)).toMatchObject({
      ok: true,
      operation: "plan",
      refName: "main",
      siteOrigin: "https://staging.rotary.example",
      projectRefSuffix: "qrst",
      errors: [],
    });
  });

  it("requires the exact confirmation for apply", () => {
    const rejected = inspectStagingReleaseInput({ ...valid, STAGING_OPERATION: "apply" });
    expect(rejected.errors).toContain("STAGING_CONFIRMATION_MISMATCH");

    const accepted = inspectStagingReleaseInput({
      ...valid,
      STAGING_OPERATION: "apply",
      STAGING_CONFIRMATION: "DEPLOY-STAGING",
    });
    expect(accepted.ok).toBe(true);
  });

  it("rejects non-main refs and unsafe staging origins", () => {
    const result = inspectStagingReleaseInput({
      ...valid,
      GITHUB_REF_NAME: "feature/test",
      STAGING_BASE_URL: "http://localhost:3000/path",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_RELEASE_MAIN_ONLY",
      "STAGING_BASE_URL_HTTPS_ORIGIN_REQUIRED",
      "STAGING_BASE_URL_PUBLIC_HOST_REQUIRED",
    ]));
  });

  it("rejects malformed project references and operations", () => {
    const result = inspectStagingReleaseInput({
      ...valid,
      STAGING_OPERATION: "production",
      SUPABASE_PROJECT_REF: "wrong ref",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_OPERATION_INVALID",
      "SUPABASE_PROJECT_REF_INVALID",
    ]));
  });

  it("never includes access tokens or database passwords in its report", () => {
    const accessToken = "never-print-access-token";
    const databasePassword = "never-print-db-password";
    const result = inspectStagingReleaseInput({
      ...valid,
      SUPABASE_ACCESS_TOKEN: accessToken,
      SUPABASE_DB_PASSWORD: databasePassword,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(accessToken);
    expect(serialized).not.toContain(databasePassword);
  });
});
