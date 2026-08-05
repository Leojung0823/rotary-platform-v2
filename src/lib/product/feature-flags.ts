export const featureFlagKeys = [
  "role_context_v2",
  "role_shells_v2",
  "member_home_v2",
  "checkin_qr_v2",
  "checkin_gps_v2",
  "attendance_ui_v2",
  "announcements_v09",
] as const;

export type FeatureFlagKey = (typeof featureFlagKeys)[number];
export type AppEnvironment = "local" | "staging" | "production";

export type FeatureFlagRecord = {
  enabled: boolean;
  enabledEnvironments: readonly AppEnvironment[];
  rolloutPercentage: number;
};

export type FeatureFlagEvaluationReason =
  | "enabled"
  | "kill_switch"
  | "missing_configuration"
  | "invalid_configuration"
  | "environment_not_allowed"
  | "rollout_disabled"
  | "rollout_key_required"
  | "outside_rollout";

export type FeatureFlagEvaluation = {
  enabled: boolean;
  key: FeatureFlagKey;
  reason: FeatureFlagEvaluationReason;
};

export const emergencyKillSwitches: Partial<Record<FeatureFlagKey, string>> = {
  role_shells_v2: "FORCE_LEGACY_ROLE_SHELLS",
  member_home_v2: "FORCE_LEGACY_MEMBER_HOME",
  checkin_gps_v2: "DISABLE_GPS_CHECKIN",
};

function isStrictBoolean(value: string | undefined) {
  return value === undefined || value === "true" || value === "false";
}

function hashRolloutKey(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isValidRecord(record: FeatureFlagRecord) {
  return (
    typeof record.enabled === "boolean" &&
    Array.isArray(record.enabledEnvironments) &&
    record.enabledEnvironments.every((environment) =>
      environment === "local" || environment === "staging" || environment === "production"
    ) &&
    Number.isFinite(record.rolloutPercentage) &&
    record.rolloutPercentage >= 0 &&
    record.rolloutPercentage <= 100
  );
}

export function resolveAppEnvironment(value: string | undefined): AppEnvironment | null {
  if (value === undefined || value === "local") return "local";
  if (value === "staging" || value === "production") return value;
  return null;
}

export function evaluateFeatureFlag({
  key,
  record,
  environment,
  rolloutKey,
  env = process.env,
}: {
  key: FeatureFlagKey;
  record: FeatureFlagRecord | null | undefined;
  environment: AppEnvironment;
  rolloutKey?: string | null;
  env?: Readonly<Record<string, string | undefined>>;
}): FeatureFlagEvaluation {
  const killSwitchName = emergencyKillSwitches[key];
  const killSwitchValue = killSwitchName ? env[killSwitchName] : undefined;

  if (!isStrictBoolean(killSwitchValue)) {
    return { enabled: false, key, reason: "invalid_configuration" };
  }

  if (killSwitchValue === "true") {
    return { enabled: false, key, reason: "kill_switch" };
  }

  if (!record) {
    return { enabled: false, key, reason: "missing_configuration" };
  }

  if (!isValidRecord(record)) {
    return { enabled: false, key, reason: "invalid_configuration" };
  }

  if (!record.enabled) {
    return { enabled: false, key, reason: "rollout_disabled" };
  }

  if (!record.enabledEnvironments.includes(environment)) {
    return { enabled: false, key, reason: "environment_not_allowed" };
  }

  if (record.rolloutPercentage === 100) {
    return { enabled: true, key, reason: "enabled" };
  }

  if (record.rolloutPercentage === 0) {
    return { enabled: false, key, reason: "rollout_disabled" };
  }

  const normalizedRolloutKey = rolloutKey?.trim();
  if (!normalizedRolloutKey) {
    return { enabled: false, key, reason: "rollout_key_required" };
  }

  const bucket = hashRolloutKey(`${key}:${normalizedRolloutKey}`) % 100;
  return bucket < record.rolloutPercentage
    ? { enabled: true, key, reason: "enabled" }
    : { enabled: false, key, reason: "outside_rollout" };
}
