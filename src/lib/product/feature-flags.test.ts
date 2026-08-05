import { describe, expect, it } from "vitest";
import { evaluateFeatureFlag, resolveAppEnvironment, type FeatureFlagRecord } from "./feature-flags";

const enabledRecord: FeatureFlagRecord = {
  enabled: true,
  enabledEnvironments: ["local", "staging", "production"],
  rolloutPercentage: 100,
};

describe("feature flag evaluation", () => {
  it("enables a fully rolled-out flag in an allowed environment", () => {
    expect(
      evaluateFeatureFlag({
        key: "role_context_v2",
        record: enabledRecord,
        environment: "staging",
        env: {},
      })
    ).toEqual({ enabled: true, key: "role_context_v2", reason: "enabled" });
  });

  it("fails closed when the database configuration is unavailable", () => {
    expect(
      evaluateFeatureFlag({
        key: "member_home_v2",
        record: null,
        environment: "production",
        env: {},
      })
    ).toEqual({ enabled: false, key: "member_home_v2", reason: "missing_configuration" });
  });

  it("lets an emergency kill switch override an enabled database record", () => {
    expect(
      evaluateFeatureFlag({
        key: "member_home_v2",
        record: enabledRecord,
        environment: "production",
        env: { FORCE_LEGACY_MEMBER_HOME: "true" },
      })
    ).toEqual({ enabled: false, key: "member_home_v2", reason: "kill_switch" });
  });

  it("fails closed for malformed kill-switch values", () => {
    expect(
      evaluateFeatureFlag({
        key: "checkin_gps_v2",
        record: enabledRecord,
        environment: "staging",
        env: { DISABLE_GPS_CHECKIN: "yes" },
      })
    ).toEqual({ enabled: false, key: "checkin_gps_v2", reason: "invalid_configuration" });
  });

  it("rejects an environment that is not explicitly allowed", () => {
    expect(
      evaluateFeatureFlag({
        key: "announcements_v09",
        record: { ...enabledRecord, enabledEnvironments: ["local", "staging"] },
        environment: "production",
        env: {},
      })
    ).toEqual({ enabled: false, key: "announcements_v09", reason: "environment_not_allowed" });
  });

  it("requires an opaque rollout key for partial rollout", () => {
    expect(
      evaluateFeatureFlag({
        key: "role_shells_v2",
        record: { ...enabledRecord, rolloutPercentage: 50 },
        environment: "staging",
        env: {},
      })
    ).toEqual({ enabled: false, key: "role_shells_v2", reason: "rollout_key_required" });
  });

  it("assigns the same rollout key deterministically", () => {
    const input = {
      key: "role_shells_v2" as const,
      record: { ...enabledRecord, rolloutPercentage: 37 },
      environment: "staging" as const,
      rolloutKey: "opaque-account-reference",
      env: {},
    };

    expect(evaluateFeatureFlag(input)).toEqual(evaluateFeatureFlag(input));
  });

  it("rejects invalid rollout percentages", () => {
    expect(
      evaluateFeatureFlag({
        key: "attendance_ui_v2",
        record: { ...enabledRecord, rolloutPercentage: 101 },
        environment: "local",
        env: {},
      })
    ).toEqual({ enabled: false, key: "attendance_ui_v2", reason: "invalid_configuration" });
  });
});

describe("resolveAppEnvironment", () => {
  it("keeps supported hosted values and defaults other values to local", () => {
    expect(resolveAppEnvironment("staging")).toBe("staging");
    expect(resolveAppEnvironment("production")).toBe("production");
    expect(resolveAppEnvironment(undefined)).toBe("local");
    expect(resolveAppEnvironment("unexpected")).toBe("local");
  });
});
