import "server-only";
import { createHmac } from "node:crypto";

export const featureFlagKeys = [
  "role_context_v2",
  "role_shells_v2",
  "member_home_v2",
  "checkin_qr_v2",
  "checkin_gps_v2",
  "attendance_ui_v2",
  "announcements_v09",
  "blessing_iou_v1",
  "blessing_iou_collections_v1",
] as const;

export type FeatureFlagKey = (typeof featureFlagKeys)[number];
export type AppEnvironment = "local" | "staging" | "production";

export type FeatureFlagRecord = Readonly<{
  enabled: boolean;
  enabledEnvironments: readonly AppEnvironment[];
  rolloutPercentage: number;
}>;

export type FeatureFlagEvaluationReason =
  | "enabled"
  | "kill_switch"
  | "missing_configuration"
  | "database_read_error"
  | "invalid_configuration"
  | "invalid_environment"
  | "environment_not_allowed"
  | "disabled"
  | "rollout_subject_required"
  | "outside_rollout"
  | "invalid_key";

export type FeatureFlagEvaluation = Readonly<{
  enabled: boolean;
  key: FeatureFlagKey | null;
  reason: FeatureFlagEvaluationReason;
}>;

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

const appEnvironments: readonly AppEnvironment[] = ["local", "staging", "production"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const emergencyKillSwitches: Readonly<Partial<Record<FeatureFlagKey, string>>> = {
  role_shells_v2: "FORCE_LEGACY_ROLE_SHELLS",
  member_home_v2: "FORCE_LEGACY_MEMBER_HOME",
  checkin_gps_v2: "DISABLE_GPS_CHECKIN",
  blessing_iou_v1: "DISABLE_BLESSING_IOU",
  blessing_iou_collections_v1: "DISABLE_BLESSING_IOU_COLLECTIONS",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFeatureFlagKey(value: unknown): value is FeatureFlagKey {
  return typeof value === "string" && featureFlagKeys.includes(value as FeatureFlagKey);
}

function isAppEnvironment(value: unknown): value is AppEnvironment {
  return typeof value === "string" && appEnvironments.includes(value as AppEnvironment);
}

function isStrictBoolean(value: string | undefined) {
  return value === undefined || value === "true" || value === "false";
}

function isValidPepper(value: unknown): value is string {
  return typeof value === "string" && value.length >= 32 && !/\s/u.test(value);
}

function isInternalUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function resolveAppEnvironment(value: unknown): AppEnvironment | null {
  if (value === undefined || value === "local") return "local";
  return isAppEnvironment(value) ? value : null;
}

export function resolveRuntimeAppEnvironment(environment: ServerEnvironment = process.env): AppEnvironment | null {
  const configured = environment.APP_ENV;
  if (configured !== undefined) return resolveAppEnvironment(configured);

  const isHosted = environment.RENDER === "true"
    || environment.RENDER_SERVICE_TYPE === "web"
    || Boolean(environment.RENDER_EXTERNAL_URL);
  return isHosted ? null : "local";
}

export function parseFeatureFlagRecord(value: unknown): FeatureFlagRecord | null {
  if (!isRecord(value)
    || typeof value.enabled !== "boolean"
    || !Array.isArray(value.enabledEnvironments)
    || !value.enabledEnvironments.every(isAppEnvironment)
    || typeof value.rolloutPercentage !== "number"
    || !Number.isInteger(value.rolloutPercentage)
    || value.rolloutPercentage < 0
    || value.rolloutPercentage > 100) {
    return null;
  }

  return {
    enabled: value.enabled,
    enabledEnvironments: value.enabledEnvironments,
    rolloutPercentage: value.rolloutPercentage,
  };
}

export function calculateFeatureRolloutBucket(
  subjectUuid: unknown,
  key: unknown,
  pepper: unknown,
): number | null {
  if (!isInternalUuid(subjectUuid) || !isFeatureFlagKey(key) || !isValidPepper(pepper)) return null;

  try {
    const digest = createHmac("sha256", pepper)
      .update(`${subjectUuid}:${key}`, "utf8")
      .digest();
    return digest.readUInt32BE(0) % 100;
  } catch {
    return null;
  }
}

export function evaluateFeatureFlag({
  key,
  record,
  environment,
  subjectUuid,
  pepper,
  databaseReadFailed = false,
  env = process.env,
}: {
  key: unknown;
  record: unknown;
  environment: unknown;
  subjectUuid?: unknown;
  pepper?: unknown;
  databaseReadFailed?: boolean;
  env?: ServerEnvironment;
}): FeatureFlagEvaluation {
  if (!isFeatureFlagKey(key)) return { enabled: false, key: null, reason: "invalid_key" };

  const killSwitchName = emergencyKillSwitches[key];
  const killSwitchValue = killSwitchName ? env[killSwitchName] : undefined;
  if (!isStrictBoolean(killSwitchValue)) {
    return { enabled: false, key, reason: "invalid_configuration" };
  }
  if (killSwitchValue === "true") return { enabled: false, key, reason: "kill_switch" };

  if (databaseReadFailed) return { enabled: false, key, reason: "database_read_error" };
  if (record === null || record === undefined) {
    return { enabled: false, key, reason: "missing_configuration" };
  }
  const parsedRecord = parseFeatureFlagRecord(record);
  if (!parsedRecord) return { enabled: false, key, reason: "invalid_configuration" };

  if (!parsedRecord.enabled) return { enabled: false, key, reason: "disabled" };
  if (!isAppEnvironment(environment)) return { enabled: false, key, reason: "invalid_environment" };
  if (!parsedRecord.enabledEnvironments.includes(environment)) {
    return { enabled: false, key, reason: "environment_not_allowed" };
  }
  if (parsedRecord.rolloutPercentage === 0) return { enabled: false, key, reason: "disabled" };
  if (parsedRecord.rolloutPercentage === 100) return { enabled: true, key, reason: "enabled" };

  const bucket = calculateFeatureRolloutBucket(subjectUuid, key, pepper);
  if (bucket === null) return { enabled: false, key, reason: "rollout_subject_required" };
  return bucket < parsedRecord.rolloutPercentage
    ? { enabled: true, key, reason: "enabled" }
    : { enabled: false, key, reason: "outside_rollout" };
}

export function selectFeaturePath<T>(evaluation: FeatureFlagEvaluation, legacy: () => T, enabled: () => T): T {
  return evaluation.enabled ? enabled() : legacy();
}
