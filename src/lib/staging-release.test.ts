import { describe, expect, it } from "vitest";
import { inspectStagingReleaseInput } from "./staging-release.mjs";

const commitSha = "0123456789abcdef0123456789abcdef01234567";
const valid = {
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF_NAME: "main",
  GITHUB_SHA: commitSha,
  STAGING_OPERATION: "plan",
  STAGING_CONFIRMATION: "",
  STAGING_EXPECTED_SHA: "",
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  STAGING_BASE_URL: "https://staging.rotary.example.com",
};

describe("staging release input", () => {
  it("accepts a manually dispatched main-branch migration plan", () => {
    expect(inspectStagingReleaseInput(valid)).toMatchObject({
      ok: true,
      operation: "plan",
      eventName: "workflow_dispatch",
      refName: "main",
      commitSha,
      siteOrigin: "https://staging.rotary.example.com",
      projectRefSuffix: "qrst",
      errors: [],
    });
  });

  it("rejects apply because mutation is restricted to Staging Go-Live", () => {
    const apply = inspectStagingReleaseInput({ ...valid, STAGING_OPERATION: "apply" });
    expect(apply.errors).toContain("STAGING_OPERATION_INVALID");
  });

  it("rejects non-manual triggers, non-main refs and malformed staging origins", () => {
    const result = inspectStagingReleaseInput({
      ...valid,
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF_NAME: "feature/test",
      STAGING_BASE_URL: "http://localhost:3000/path",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_RELEASE_MANUAL_ONLY",
      "STAGING_RELEASE_MAIN_ONLY",
      "STAGING_BASE_URL_HTTPS_ORIGIN_REQUIRED",
      "STAGING_BASE_URL_PUBLIC_HOST_REQUIRED",
    ]));
  });

  it("rejects local, private, reserved and single-label staging hosts", () => {
    for (const STAGING_BASE_URL of [
      "https://staging",
      "https://printer.local",
      "https://10.0.0.8",
      "https://100.64.0.1",
      "https://192.0.2.1",
      "https://198.51.100.1",
      "https://[::1]",
      "https://[fd00::1]",
      "https://[::ffff:7f00:1]",
    ]) {
      const result = inspectStagingReleaseInput({ ...valid, STAGING_BASE_URL });
      expect(result.errors, STAGING_BASE_URL).toContain("STAGING_BASE_URL_PUBLIC_HOST_REQUIRED");
    }
  });

  it("rejects malformed revisions, project references and operations", () => {
    const result = inspectStagingReleaseInput({
      ...valid,
      GITHUB_SHA: "not-a-commit",
      STAGING_OPERATION: "production",
      SUPABASE_PROJECT_REF: "wrong ref",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "GITHUB_SHA_INVALID",
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
