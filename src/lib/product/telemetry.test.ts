import { describe, expect, it, vi } from "vitest";
import {
  isValidProductTelemetryEvent,
  recordProductTelemetry,
  type ProductTelemetryEvent,
  type ProductTelemetrySink,
} from "./telemetry";

describe("product telemetry", () => {
  it("records an allowlisted event without identifiers or arbitrary metadata", async () => {
    const write = vi.fn();
    const event: ProductTelemetryEvent = {
      name: "checkin_failure",
      method: "qr",
      durationMs: 840,
      reason: "expired",
    };

    await expect(recordProductTelemetry({ write }, event)).resolves.toEqual({ recorded: true });
    expect(write).toHaveBeenCalledWith(event);
    expect(JSON.stringify(event)).not.toMatch(/email|line|token|latitude|longitude|name/i);
  });

  it("rejects out-of-range durations before calling a sink", async () => {
    const write = vi.fn();
    const event = {
      name: "member_home_projection_duration",
      durationMs: 120_001,
      databaseRoundTrips: 2,
    } as ProductTelemetryEvent;

    await expect(recordProductTelemetry({ write }, event)).resolves.toEqual({
      recorded: false,
      reason: "invalid_event",
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects unbounded database round-trip counts", () => {
    expect(
      isValidProductTelemetryEvent({
        name: "member_home_projection_duration",
        durationMs: 200,
        databaseRoundTrips: 11,
      })
    ).toBe(false);
  });

  it("accepts only the bounded check-in reason enum", () => {
    expect(
      isValidProductTelemetryEvent({
        name: "checkin_failure",
        method: "gps",
        durationMs: 2_000,
        reason: "gps_out_of_range",
      })
    ).toBe(true);

    expect(
      isValidProductTelemetryEvent({
        name: "checkin_failure",
        method: "gps",
        durationMs: 2_000,
        reason: "raw database error" as never,
      })
    ).toBe(false);
  });

  it("contains no fields for raw coordinates, credentials or free text", () => {
    const event: ProductTelemetryEvent = {
      name: "checkin_success",
      method: "gps",
      durationMs: 1_200,
      result: "created",
    };

    expect(Object.keys(event).sort()).toEqual(["durationMs", "method", "name", "result"]);
  });

  it("contains sink failures and does not throw into product flows", async () => {
    const sink: ProductTelemetrySink = {
      write() {
        throw new Error("provider secret or internal failure");
      },
    };

    await expect(
      recordProductTelemetry(sink, {
        name: "feature_flag_evaluation_failure",
        key: "role_shells_v2",
        reason: "evaluation_error",
      })
    ).resolves.toEqual({ recorded: false, reason: "sink_failure" });
  });
});
