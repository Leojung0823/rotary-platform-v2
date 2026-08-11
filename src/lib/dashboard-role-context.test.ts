import { describe, expect, it } from "vitest";
import { applyActiveClubPreference, parseExperienceContextProjection } from "./experience-context";
import { resolveDashboardRoleContext } from "./dashboard-role-context";

const projection = {
  has_active_membership: true,
  can_register: true,
  can_manage: false,
  has_platform_access: false,
  member_clubs: [{
    club_id: "60000000-0000-4000-8000-000000000001",
    club_code: "ROLE",
    club_name: "Role Club",
    can_manage: false,
  }],
  managed_only_clubs: [],
  default_mode: "member",
  available_modes: ["member"],
};

describe("dashboard role-context feature boundary", () => {
  it("keeps the legacy dashboard when the flag is off or evaluation fails closed", () => {
    expect(resolveDashboardRoleContext({
      roleContextEnabled: false,
      context: null,
      requestedMode: "member",
    })).toEqual({ kind: "legacy", contextUnavailable: false });
  });

  it("keeps the legacy dashboard with a generic fallback when an enabled projection fails", () => {
    expect(resolveDashboardRoleContext({
      roleContextEnabled: true,
      context: null,
      requestedMode: "member",
    })).toEqual({ kind: "legacy", contextUnavailable: true });
  });

  it("uses the server projection only when the flag is on", () => {
    const parsed = parseExperienceContextProjection(projection);
    expect(parsed).not.toBeNull();
    const result = resolveDashboardRoleContext({
      roleContextEnabled: true,
      context: applyActiveClubPreference(parsed!, null),
      requestedMode: "member",
    });
    expect(result).toEqual({
      kind: "resolver",
      resolution: {
        kind: "resolver",
        mode: "member",
        destination: "/club/60000000-0000-4000-8000-000000000001",
      },
    });
  });
});
