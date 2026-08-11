import { describe, expect, it } from "vitest";
import {
  calculateFeatureRolloutBucket,
  evaluateFeatureFlag,
  resolveAppEnvironment,
  resolveRuntimeAppEnvironment,
  selectFeaturePath,
  type FeatureFlagRecord,
} from "./feature-flags";

const pepper = "test-only-feature-rollout-pepper-at-least-thirty-two-characters";
const subjectUuid = "11111111-1111-4111-8111-111111111111";
const enabledRecord: FeatureFlagRecord = {
  enabled: true,
  enabledEnvironments: ["local", "staging", "production"],
  rolloutPercentage: 100,
};

describe("feature flag evaluation truth table", () => {
  it("lets a kill switch disable an otherwise enabled database record", () => {
    expect(evaluateFeatureFlag({
      key: "member_home_v2",
      record: enabledRecord,
      environment: "production",
      pepper,
      env: { FORCE_LEGACY_MEMBER_HOME: "true" },
    })).toMatchObject({ enabled: false, reason: "kill_switch" });
  });

  it("keeps role shells on the legacy path when its server-only kill switch is enabled", () => {
    expect(evaluateFeatureFlag({
      key: "role_shells_v2",
      record: enabledRecord,
      environment: "local",
      pepper,
      env: { FORCE_LEGACY_ROLE_SHELLS: "true" },
    })).toMatchObject({ enabled: false, reason: "kill_switch" });
  });

  it("fails closed to the legacy role shell when its feature read fails", () => {
    expect(evaluateFeatureFlag({
      key: "role_shells_v2",
      record: enabledRecord,
      environment: "local",
      pepper,
      databaseReadFailed: true,
    })).toMatchObject({ enabled: false, reason: "database_read_error" });
  });

  it("never lets a kill switch enable a database-disabled feature", () => {
    expect(evaluateFeatureFlag({
      key: "member_home_v2",
      record: { ...enabledRecord, enabled: false },
      environment: "production",
      pepper,
      env: { FORCE_LEGACY_MEMBER_HOME: "false" },
    })).toMatchObject({ enabled: false, reason: "disabled" });
  });

  it("fails closed for missing, malformed, and database-disabled configuration", () => {
    for (const record of [null, { ...enabledRecord, rolloutPercentage: 101 }, { ...enabledRecord, enabled: false }]) {
      expect(evaluateFeatureFlag({
        key: "role_context_v2",
        record,
        environment: "staging",
        pepper,
      }).enabled).toBe(false);
    }
  });

  it("fails closed when the bounded database read reports an error", () => {
    expect(evaluateFeatureFlag({
      key: "role_context_v2",
      record: enabledRecord,
      environment: "staging",
      pepper,
      databaseReadFailed: true,
    })).toMatchObject({ enabled: false, reason: "database_read_error" });
  });

  it("fails closed for an invalid kill-switch value and invalid runtime environment", () => {
    expect(evaluateFeatureFlag({
      key: "checkin_gps_v2",
      record: enabledRecord,
      environment: "staging",
      pepper,
      env: { DISABLE_GPS_CHECKIN: "yes" },
    }).enabled).toBe(false);
    expect(evaluateFeatureFlag({
      key: "checkin_qr_v2",
      record: enabledRecord,
      environment: "preview",
      pepper,
    }).enabled).toBe(false);
  });

  it("requires the current server environment to be explicitly allowed", () => {
    expect(evaluateFeatureFlag({
      key: "announcements_v09",
      record: { ...enabledRecord, enabledEnvironments: ["local", "staging"] },
      environment: "production",
      pepper,
    })).toMatchObject({ enabled: false, reason: "environment_not_allowed" });
  });

  it("keeps zero percent disabled and one hundred percent enabled", () => {
    expect(evaluateFeatureFlag({
      key: "role_shells_v2",
      record: { ...enabledRecord, rolloutPercentage: 0 },
      environment: "staging",
      pepper,
    }).enabled).toBe(false);
    expect(evaluateFeatureFlag({
      key: "role_shells_v2",
      record: enabledRecord,
      environment: "staging",
      pepper,
    }).enabled).toBe(true);
  });

  it("is deterministic for a subject, feature key, and pepper", () => {
    const first = calculateFeatureRolloutBucket(subjectUuid, "role_shells_v2", pepper);
    expect(first).not.toBeNull();
    expect(calculateFeatureRolloutBucket(subjectUuid, "role_shells_v2", pepper)).toBe(first);
  });

  it("includes the feature key in the HMAC input", () => {
    const buckets = [
      "role_context_v2",
      "role_shells_v2",
      "member_home_v2",
      "checkin_qr_v2",
      "checkin_gps_v2",
      "attendance_ui_v2",
      "announcements_v09",
    ].map((key) => calculateFeatureRolloutBucket(subjectUuid, key, pepper));
    expect(new Set(buckets).size).toBeGreaterThan(1);
  });

  it("rejects unknown keys and an invalid partial-rollout subject", () => {
    expect(evaluateFeatureFlag({
      key: "not_a_feature",
      record: enabledRecord,
      environment: "staging",
      pepper,
    })).toMatchObject({ enabled: false, reason: "invalid_key" });
    expect(evaluateFeatureFlag({
      key: "role_shells_v2",
      record: { ...enabledRecord, rolloutPercentage: 50 },
      environment: "staging",
      subjectUuid: "public-email@example.test",
      pepper,
    })).toMatchObject({ enabled: false, reason: "rollout_subject_required" });
  });

  it("selects the legacy path on every failed evaluation instead of throwing", () => {
    const result = selectFeaturePath(
      evaluateFeatureFlag({
        key: "member_home_v2",
        record: null,
        environment: "production",
        pepper,
      }),
      () => "legacy",
      () => "v2",
    );
    expect(result).toBe("legacy");
  });

  it("reads kill switches for each evaluation without cross-request cache delay", () => {
    const input = {
      key: "member_home_v2",
      record: enabledRecord,
      environment: "staging",
      pepper,
    } as const;
    expect(evaluateFeatureFlag({ ...input, env: { FORCE_LEGACY_MEMBER_HOME: "false" } }).enabled).toBe(true);
    expect(evaluateFeatureFlag({ ...input, env: { FORCE_LEGACY_MEMBER_HOME: "true" } }).enabled).toBe(false);
  });
});

describe("server environment resolution", () => {
  it("accepts only bounded values and fails closed for an unconfigured hosted runtime", () => {
    expect(resolveAppEnvironment("local")).toBe("local");
    expect(resolveAppEnvironment("staging")).toBe("staging");
    expect(resolveAppEnvironment("production")).toBe("production");
    expect(resolveAppEnvironment("preview")).toBeNull();
    expect(resolveRuntimeAppEnvironment({ RENDER: "true" })).toBeNull();
    expect(resolveRuntimeAppEnvironment({})).toBe("local");
  });
});

describe("deterministic rollout distribution", () => {
  const subjects = Array.from({ length: 1_000 }, (_, index) =>
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );

  for (const percentage of [10, 25, 50]) {
    it(`keeps ${percentage}% within a deterministic four-point tolerance`, () => {
      const selected = subjects.filter((subject) => {
        const bucket = calculateFeatureRolloutBucket(subject, "checkin_qr_v2", pepper);
        return bucket !== null && bucket < percentage;
      }).length;
      expect(selected).toBeGreaterThanOrEqual(percentage * 10 - 40);
      expect(selected).toBeLessThanOrEqual(percentage * 10 + 40);
    });
  }
});
