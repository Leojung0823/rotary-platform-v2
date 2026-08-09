import { describe, expect, it } from "vitest";
import { applyActiveClubPreference, parseExperienceContextProjection } from "./experience-context";
import { resolveExperienceDashboard } from "./experience-routing";

const memberClub = {
  club_id: "20000000-0000-4000-8000-000000000001",
  club_code: "MEMBER",
  club_name: "Member Club",
  can_manage: true,
};
const managedClub = {
  club_id: "20000000-0000-4000-8000-000000000002",
  club_code: "MANAGED",
  club_name: "Managed Club",
  can_manage: true,
};

function context(preferredClubId: unknown = null) {
  const projection = parseExperienceContextProjection({
    has_active_membership: true,
    can_register: true,
    can_manage: true,
    has_platform_access: true,
    member_clubs: [memberClub],
    managed_only_clubs: [managedClub],
    default_mode: "member",
    available_modes: ["member", "management", "platform"],
  });
  expect(projection).not.toBeNull();
  return applyActiveClubPreference(projection!, preferredClubId);
}

describe("dashboard role routing", () => {
  it("uses member mode by default and never resolves back to dashboard", () => {
    const resolved = resolveExperienceDashboard(context(), undefined);
    expect(resolved).toEqual({
      kind: "resolver",
      mode: "member",
      destination: `/club/${memberClub.club_id}`,
    });
    expect(resolved.kind === "resolver" && resolved.destination).not.toContain("/dashboard");
  });

  it("allows only server-projected modes and routes management to a management destination", () => {
    expect(resolveExperienceDashboard(context(managedClub.club_id), "management")).toEqual({
      kind: "resolver",
      mode: "management",
      destination: `/clubs/${managedClub.club_id}/identity`,
    });
    expect(resolveExperienceDashboard(context(), "invented-role")).toMatchObject({ mode: "member" });
  });

  it("keeps platform routing separate from club routing", () => {
    expect(resolveExperienceDashboard(context(), "platform")).toEqual({
      kind: "resolver",
      mode: "platform",
      destination: "/platform/clubs",
    });
  });
});
