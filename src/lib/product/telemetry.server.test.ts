import { describe, expect, it, vi } from "vitest";
import { boundedTelemetryFailureSignal, dailyTelemetryPseudonym } from "./telemetry.server";

const pepper = "test-only-telemetry-pepper-at-least-thirty-two-characters";
const accountId = "22222222-2222-4222-8222-222222222222";

describe("daily telemetry pseudonym", () => {
  it("is deterministic within a UTC day and changes on the next day", () => {
    const first = dailyTelemetryPseudonym({
      accountId, utcDate: "2026-08-06", eventFamily: "checkin", pepper,
    });
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(dailyTelemetryPseudonym({
      accountId, utcDate: "2026-08-06", eventFamily: "checkin", pepper,
    })).toBe(first);
    expect(dailyTelemetryPseudonym({
      accountId, utcDate: "2026-08-07", eventFamily: "checkin", pepper,
    })).not.toBe(first);
  });

  it("uses the event family and rejects non-opaque input", () => {
    expect(dailyTelemetryPseudonym({
      accountId, utcDate: "2026-08-06", eventFamily: "member_home", pepper,
    })).not.toBe(dailyTelemetryPseudonym({
      accountId, utcDate: "2026-08-06", eventFamily: "checkin", pepper,
    }));
    expect(dailyTelemetryPseudonym({
      accountId: "email@example.test", utcDate: "2026-08-06", eventFamily: "checkin", pepper,
    })).toBeNull();
  });
});

describe("bounded telemetry sink failure signal", () => {
  it("deduplicates repeated failures without recording telemetry recursively", () => {
    const report = vi.fn();
    let time = 0;
    const signal = boundedTelemetryFailureSignal(report, () => time);
    signal.report();
    signal.report();
    time += 60_000;
    signal.report();
    expect(report).toHaveBeenCalledTimes(2);
  });
});
