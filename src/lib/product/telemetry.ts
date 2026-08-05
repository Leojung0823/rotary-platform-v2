import { featureFlagKeys, type FeatureFlagKey } from "./feature-flags";

export const checkinMethods = ["qr", "gps", "manual"] as const;
export type CheckinMethod = (typeof checkinMethods)[number];

export const checkinFailureReasons = [
  "expired",
  "previous_code_grace_expired",
  "session_closed",
  "not_started",
  "not_eligible",
  "duplicate",
  "network_timeout",
  "gps_denied",
  "gps_unavailable",
  "gps_out_of_range",
  "gps_low_quality",
  "unexpected",
] as const;
export type CheckinFailureReason = (typeof checkinFailureReasons)[number];

export const telemetryFailureReasons = [
  "database_unavailable",
  "invalid_projection",
  "authorization_denied",
  "invalid_configuration",
  "unexpected",
] as const;
export type TelemetryFailureReason = (typeof telemetryFailureReasons)[number];

export type ProductTelemetryEvent =
  | {
      name: "member_context_resolve_success";
      durationMs: number;
      clubCount: number;
      modeCount: number;
    }
  | {
      name: "member_context_resolve_failure";
      durationMs: number;
      reason: TelemetryFailureReason;
    }
  | {
      name: "member_home_projection_duration";
      durationMs: number;
      databaseRoundTrips: number;
    }
  | {
      name: "member_home_projection_failure";
      durationMs: number;
      reason: TelemetryFailureReason;
    }
  | {
      name: "checkin_attempt";
      method: CheckinMethod;
    }
  | {
      name: "checkin_success";
      method: CheckinMethod;
      durationMs: number;
      result: "created" | "duplicate" | "current_qr" | "grace_qr";
    }
  | {
      name: "checkin_failure";
      method: CheckinMethod;
      durationMs: number;
      reason: CheckinFailureReason;
    }
  | {
      name: "checkin_pending_confirmation";
      method: CheckinMethod;
      reason: "network_timeout";
    }
  | {
      name: "feature_flag_evaluation_failure";
      key: FeatureFlagKey;
      reason: "missing_configuration" | "invalid_configuration" | "evaluation_error";
    };

export type ProductTelemetrySink = {
  write(event: ProductTelemetryEvent): void | Promise<void>;
};

export type ProductTelemetryResult =
  | { recorded: true }
  | { recorded: false; reason: "invalid_event" | "sink_failure" };

const MAX_DURATION_MS = 120_000;
const MAX_COUNT = 1_000;
const checkinSuccessResults = ["created", "duplicate", "current_qr", "grace_qr"] as const;
const flagFailureReasons = ["missing_configuration", "invalid_configuration", "evaluation_error"] as const;

function isBoundedInteger(value: unknown, maximum: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  return actual.length === allowed.length && actual.every((key, index) => key === allowed[index]);
}

export function isValidProductTelemetryEvent(event: unknown): event is ProductTelemetryEvent {
  if (!isRecord(event) || typeof event.name !== "string") return false;

  switch (event.name) {
    case "member_context_resolve_success":
      return (
        hasExactKeys(event, ["name", "durationMs", "clubCount", "modeCount"]) &&
        isBoundedInteger(event.durationMs, MAX_DURATION_MS) &&
        isBoundedInteger(event.clubCount, MAX_COUNT) &&
        isBoundedInteger(event.modeCount, 3)
      );
    case "member_context_resolve_failure":
    case "member_home_projection_failure":
      return (
        hasExactKeys(event, ["name", "durationMs", "reason"]) &&
        isBoundedInteger(event.durationMs, MAX_DURATION_MS) &&
        includes(telemetryFailureReasons, event.reason)
      );
    case "member_home_projection_duration":
      return (
        hasExactKeys(event, ["name", "durationMs", "databaseRoundTrips"]) &&
        isBoundedInteger(event.durationMs, MAX_DURATION_MS) &&
        isBoundedInteger(event.databaseRoundTrips, 10)
      );
    case "checkin_attempt":
      return hasExactKeys(event, ["name", "method"]) && includes(checkinMethods, event.method);
    case "checkin_success":
      return (
        hasExactKeys(event, ["name", "method", "durationMs", "result"]) &&
        includes(checkinMethods, event.method) &&
        isBoundedInteger(event.durationMs, MAX_DURATION_MS) &&
        includes(checkinSuccessResults, event.result)
      );
    case "checkin_failure":
      return (
        hasExactKeys(event, ["name", "method", "durationMs", "reason"]) &&
        includes(checkinMethods, event.method) &&
        isBoundedInteger(event.durationMs, MAX_DURATION_MS) &&
        includes(checkinFailureReasons, event.reason)
      );
    case "checkin_pending_confirmation":
      return (
        hasExactKeys(event, ["name", "method", "reason"]) &&
        includes(checkinMethods, event.method) &&
        event.reason === "network_timeout"
      );
    case "feature_flag_evaluation_failure":
      return (
        hasExactKeys(event, ["name", "key", "reason"]) &&
        includes(featureFlagKeys, event.key) &&
        includes(flagFailureReasons, event.reason)
      );
    default:
      return false;
  }
}

export async function recordProductTelemetry(
  sink: ProductTelemetrySink,
  event: ProductTelemetryEvent
): Promise<ProductTelemetryResult> {
  if (!isValidProductTelemetryEvent(event)) {
    return { recorded: false, reason: "invalid_event" };
  }

  try {
    await sink.write(event);
    return { recorded: true };
  } catch {
    return { recorded: false, reason: "sink_failure" };
  }
}

export const noOpProductTelemetrySink: ProductTelemetrySink = {
  write() {},
};
