import type { FeatureFlagKey } from "./feature-flags";

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

function isBoundedInteger(value: number, maximum: number) {
  return Number.isInteger(value) && value >= 0 && value <= maximum;
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function isValidProductTelemetryEvent(event: ProductTelemetryEvent) {
  switch (event.name) {
    case "member_context_resolve_success":
      return (
        isBoundedInteger(event.durationMs, MAX_DURATION_MS) &&
        isBoundedInteger(event.clubCount, MAX_COUNT) &&
        isBoundedInteger(event.modeCount, 3)
      );
    case "member_context_resolve_failure":
    case "member_home_projection_failure":
      return (
        isBoundedInteger(event.durationMs, MAX_DURATION_MS) &&
        includes(telemetryFailureReasons, event.reason)
      );
    case "member_home_projection_duration":
      return (
        isBoundedInteger(event.durationMs, MAX_DURATION_MS) &&
        isBoundedInteger(event.databaseRoundTrips, 10)
      );
    case "checkin_attempt":
      return includes(checkinMethods, event.method);
    case "checkin_success":
      return (
        includes(checkinMethods, event.method) &&
        isBoundedInteger(event.durationMs, MAX_DURATION_MS) &&
        ["created", "duplicate", "current_qr", "grace_qr"].includes(event.result)
      );
    case "checkin_failure":
      return (
        includes(checkinMethods, event.method) &&
        isBoundedInteger(event.durationMs, MAX_DURATION_MS) &&
        includes(checkinFailureReasons, event.reason)
      );
    case "checkin_pending_confirmation":
      return includes(checkinMethods, event.method) && event.reason === "network_timeout";
    case "feature_flag_evaluation_failure":
      return ["missing_configuration", "invalid_configuration", "evaluation_error"].includes(event.reason);
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
