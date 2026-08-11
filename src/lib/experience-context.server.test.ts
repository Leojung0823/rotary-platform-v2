import { describe, expect, it } from "vitest";
import {
  classifyExperienceContextFailure,
  experienceContextTelemetryEvent,
  resolveExperienceContextValue,
} from "./experience-context.server";

const projection = {
  has_active_membership: true,
  can_register: true,
  can_manage: false,
  has_platform_access: false,
  member_clubs: [{
    club_id: "40000000-0000-4000-8000-000000000001",
    club_code: "A",
    club_name: "Club A",
    can_manage: false,
  }],
  managed_only_clubs: [],
  default_mode: "member",
  available_modes: ["member"],
};

describe("server experience-context boundary", () => {
  it("classifies authorization without exposing a database error", () => {
    expect(classifyExperienceContextFailure({ code: "42501", message: "internal" })).toBe("authorization_denied");
    expect(classifyExperienceContextFailure({ code: "XX000" })).toBe("database_unavailable");
  });

  it("rejects malformed RPC values before they become routing state", () => {
    expect(resolveExperienceContextValue({ ...projection, member_clubs: "not-an-array" }, null))
      .toEqual({ ok: false, reason: "invalid_projection" });
  });

  it("records only bounded member-context telemetry payloads", () => {
    const success = resolveExperienceContextValue(projection, projection.member_clubs[0].club_id);
    expect(success.ok).toBe(true);
    expect(experienceContextTelemetryEvent(success, 120_001)).toEqual({
      name: "member_context_resolve_success",
      durationMs: 120_000,
      clubCount: 1,
      modeCount: 1,
    });
    expect(experienceContextTelemetryEvent({ ok: false, reason: "authorization_denied" }, -10)).toEqual({
      name: "member_context_resolve_failure",
      durationMs: 0,
      reason: "authorization_denied",
    });
  });
});
