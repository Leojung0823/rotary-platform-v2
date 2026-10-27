import { describe, expect, it } from "vitest";
import {
  formatStagingDashboardTimings,
  parseStagingDashboardTimings,
} from "./staging-performance-telemetry.mjs";

describe("staging dashboard timing summary", () => {
  it("extracts only bounded aggregate columns from CLI output", () => {
    const output = `Connecting to project...\n${JSON.stringify({
      rows: [{
        event_name: "member_home_projection_duration",
        sample_count: 5,
        median_duration_ms: "72.4",
        p95_duration_ms: "105.8",
      }],
      warning: "database result is untrusted",
    })}`;

    const timings = parseStagingDashboardTimings(output);
    expect(timings).toEqual([{
      eventName: "member_home_projection_duration",
      sampleCount: 5,
      medianDurationMs: 72.4,
      p95DurationMs: 105.8,
    }]);
    expect(formatStagingDashboardTimings(timings)).toContain("社員首頁資料投影");
  });

  it("rejects unknown events and any extra column that could carry private data", () => {
    const unknownEvent = JSON.stringify({ rows: [{
      event_name: "member_email",
      sample_count: 1,
      median_duration_ms: 2,
      p95_duration_ms: 2,
    }] });
    const extraColumn = JSON.stringify({ rows: [{
      event_name: "member_context_resolve_success",
      sample_count: 1,
      median_duration_ms: 2,
      p95_duration_ms: 2,
      daily_subject: "must-not-be-read",
    }] });

    expect(parseStagingDashboardTimings(unknownEvent)).toBeNull();
    expect(parseStagingDashboardTimings(extraColumn)).toBeNull();
    expect(formatStagingDashboardTimings(null)).not.toContain("must-not-be-read");
  });

  it("reports empty windows without inventing timings", () => {
    const empty = parseStagingDashboardTimings(JSON.stringify({ rows: [] }));
    expect(empty).toEqual([]);
    expect(formatStagingDashboardTimings(empty)).toContain("No usable telemetry samples");
  });
});
