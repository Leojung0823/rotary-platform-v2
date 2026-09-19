import { describe, expect, it } from "vitest";
import {
  fixtureAccountValues,
  fixtureMarker,
  fixturePushLogValues,
  inspectStagingLineQuotaAcceptanceInput,
  isFixtureAccount,
  isFixturePushLog,
  STAGING_LINE_QUOTA_CONFIRMATION,
} from "./staging-line-quota-acceptance.mjs";

const validInput = {
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF_NAME: "main",
  GITHUB_SHA: "a".repeat(40),
  STAGING_EXPECTED_SHA: "a".repeat(40),
  STAGING_LINE_QUOTA_ACCEPTANCE_CONFIRMATION: STAGING_LINE_QUOTA_CONFIRMATION,
  STAGING_BASE_URL: "https://rotary-platform-v2-mrha.onrender.com",
  STAGING_EXPECTED_CLUB_NAME: "Rotary Platform Staging Test Club",
  STAGING_TEST_OPERATOR_EMAIL: "staging-operator@example.test",
  STAGING_TEST_OPERATOR_PASSWORD: "a-secure-staging-password",
  STAGING_TEST_MEMBER_EMAIL: "staging-member@example.test",
  STAGING_TEST_MEMBER_PASSWORD: "a-secure-staging-member-password",
  SUPABASE_PROJECT_REF: "vmmzdautcsgknhyqrsto",
  NEXT_PUBLIC_SUPABASE_URL: "https://vmmzdautcsgknhyqrsto.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-without-printing-it",
  STAGING_LINE_QUOTA_FIXTURE_ID: "quota-12345",
  APP_ENV: "staging",
  TRUSTED_ADMIN_ENVIRONMENT: "staging",
};

describe("protected staging LINE quota acceptance", () => {
  it("accepts only an exact manual main/staging run", () => {
    expect(inspectStagingLineQuotaAcceptanceInput(validInput).ok).toBe(true);
    expect(inspectStagingLineQuotaAcceptanceInput({
      ...validInput,
      GITHUB_EVENT_NAME: "push",
    }).errors).toContain("STAGING_LINE_QUOTA_MANUAL_ONLY");
    expect(inspectStagingLineQuotaAcceptanceInput({
      ...validInput,
      STAGING_EXPECTED_SHA: "b".repeat(40),
    }).errors).toContain("STAGING_EXPECTED_SHA_MISMATCH");
  });

  it("rejects a real-looking operator or production boundary", () => {
    const result = inspectStagingLineQuotaAcceptanceInput({
      ...validInput,
      STAGING_TEST_OPERATOR_EMAIL: "person@example.com",
      APP_ENV: "production",
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_TEST_OPERATOR_EMAIL_INVALID",
      "STAGING_APP_ENV_REQUIRED",
    ]));
  });

  it("recognizes only its own synthetic account and log", () => {
    const fixture = fixtureAccountValues({ fixtureId: "quota-12345", clubId: "club-1" });
    const log = fixturePushLogValues({ fixtureId: "quota-12345", clubId: "club-1", accountId: "account-1" });
    expect(fixtureMarker("quota-12345")).toBe("rotary-platform-v2:quota-12345");
    expect(isFixtureAccount(fixture, { fixtureId: "quota-12345", clubId: "club-1" })).toBe(true);
    expect(isFixtureAccount({ ...fixture, club_id: "club-2" }, { fixtureId: "quota-12345", clubId: "club-1" })).toBe(false);
    expect(isFixturePushLog({ ...log, line_oa_account_id: "account-1" }, {
      fixtureId: "quota-12345", clubId: "club-1", accountId: "account-1",
    })).toBe(true);
    expect(isFixturePushLog({ ...log, payload_summary: { ...log.payload_summary, test_marker: "other" } }, {
      fixtureId: "quota-12345", clubId: "club-1", accountId: "account-1",
    })).toBe(false);
  });
});
