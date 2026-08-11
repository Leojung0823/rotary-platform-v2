import { describe, expect, it, vi } from "vitest";
import {
  isValidProductTelemetryEvent,
  productTelemetryRetentionClass,
  recordProductTelemetry,
  telemetryDatabasePayload,
  telemetryEventRequiresDailySubject,
  type ProductTelemetryEvent,
} from "./telemetry";

describe("product telemetry closed schema", () => {
  it("records an allowlisted event without identifiers or arbitrary metadata", async () => {
    const write = vi.fn();
    const event: ProductTelemetryEvent = {
      name: "checkin_failure", method: "qr", durationMs: 840, reason: "expired",
    };
    await expect(recordProductTelemetry({ write }, event)).resolves.toEqual({ recorded: true });
    expect(write).toHaveBeenCalledWith(event);
    expect(Object.keys(event).sort()).toEqual(["durationMs", "method", "name", "reason"]);
  });

  it("rejects unknown events, payload keys, values, free text, and arbitrary JSON", () => {
    expect(isValidProductTelemetryEvent({ name: "unknown" })).toBe(false);
    expect(isValidProductTelemetryEvent({
      name: "checkin_failure", method: "qr", durationMs: 840, reason: "expired", email: "private@example.test",
    })).toBe(false);
    expect(isValidProductTelemetryEvent({
      name: "checkin_failure", method: "gps", durationMs: 120_001, reason: "raw database error",
    })).toBe(false);
    expect(isValidProductTelemetryEvent({
      name: "checkin_success", method: "qr", durationMs: 1, result: "created", metadata: {},
    })).toBe(false);
  });

  it("maps only bounded typed fields to the database payload", () => {
    const payload = telemetryDatabasePayload({
      name: "member_home_projection_duration", durationMs: 12, databaseRoundTrips: 2,
    });
    expect(payload).toEqual({ duration_ms: 12, database_round_trips: 2 });
    expect(Object.values(payload).every((value) => typeof value !== "object")).toBe(true);
  });

  it("assigns only the approved retention classes", () => {
    expect(productTelemetryRetentionClass("checkin_success")).toBe("product_checkin_90d");
    expect(productTelemetryRetentionClass("member_context_resolve_success")).toBe("product_performance_90d");
  });

  it("uses a daily subject only for user-flow event families", () => {
    expect(telemetryEventRequiresDailySubject({ name: "checkin_attempt", method: "qr" })).toBe(true);
    expect(telemetryEventRequiresDailySubject({
      name: "feature_flag_evaluation_failure", key: "role_context_v2", reason: "evaluation_error",
    })).toBe(false);
  });
});

describe("product telemetry containment", () => {
  it("contains sink failures, emits one bounded signal, and never recurses", async () => {
    const report = vi.fn();
    const sink = { write: vi.fn(() => { throw new Error("sensitive failure"); }) };
    const event: ProductTelemetryEvent = {
      name: "feature_flag_evaluation_failure", key: "role_shells_v2", reason: "evaluation_error",
    };

    await expect(recordProductTelemetry(sink, event, { report })).resolves.toEqual({
      recorded: false,
      reason: "sink_failure",
    });
    expect(sink.write).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledTimes(1);
  });
});
