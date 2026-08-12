import { describe, expect, it } from "vitest";
import { classifyMemberHomeFailure, memberHomeTelemetryEvent } from "./member-home.server";

describe("member-home server boundary", () => {
  it("classifies authorization without exposing database details", () => {
    expect(classifyMemberHomeFailure({ code: "42501", message: "private" })).toBe("authorization_denied");
    expect(classifyMemberHomeFailure({ code: "XX000" })).toBe("database_unavailable");
  });

  it("records one bounded projection round trip on success", () => {
    expect(memberHomeTelemetryEvent({ ok: true, projection: {
      club: { clubCode: "A", clubName: "A 社" }, primaryEvent: null, nextEvent: null, recentEvents: [],
    } }, 120_001)).toEqual({
      name: "member_home_projection_duration", durationMs: 120_000, databaseRoundTrips: 1,
    });
  });

  it("records only a bounded failure reason when the projection fails", () => {
    expect(memberHomeTelemetryEvent({ ok: false, reason: "authorization_denied" }, -2)).toEqual({
      name: "member_home_projection_failure", durationMs: 0, reason: "authorization_denied",
    });
  });
});
