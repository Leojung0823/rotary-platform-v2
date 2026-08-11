import { describe, expect, it } from "vitest";
import { applyActiveClubPreference, parseExperienceContextProjection } from "./experience-context";
import { roleShellNavigation, resolveRoleShell } from "./role-shells";

const memberClub = {
  club_id: "71000000-0000-4000-8000-000000000001",
  club_code: "MEMBER",
  club_name: "Member Club",
  can_manage: true,
};
const managedOnlyClub = {
  club_id: "71000000-0000-4000-8000-000000000002",
  club_code: "MANAGED",
  club_name: "Managed Club",
  can_manage: true,
};

function context({
  member = true,
  management = true,
  platform = true,
}: {
  member?: boolean;
  management?: boolean;
  platform?: boolean;
} = {}) {
  const memberClubs = member ? [{ ...memberClub, can_manage: management }] : [];
  const managedOnlyClubs = management && !member ? [managedOnlyClub] : management ? [managedOnlyClub] : [];
  const availableModes = [
    ...(member ? ["member"] : []),
    ...(management ? ["management"] : []),
    ...(platform ? ["platform"] : []),
  ];
  const projection = parseExperienceContextProjection({
    has_active_membership: member,
    can_register: member,
    can_manage: management,
    has_platform_access: platform,
    member_clubs: memberClubs,
    managed_only_clubs: managedOnlyClubs,
    default_mode: availableModes[0],
    available_modes: availableModes,
  });
  expect(projection).not.toBeNull();
  return applyActiveClubPreference(projection!, memberClub.club_id);
}

describe("role-aware shell boundary", () => {
  it("keeps the legacy shell when the feature is off or context cannot be resolved", () => {
    expect(resolveRoleShell({ roleShellsEnabled: false, context: context(), requestedMode: "platform" }))
      .toEqual({ kind: "legacy", contextUnavailable: false });
    expect(resolveRoleShell({ roleShellsEnabled: true, context: null, requestedMode: "member" }))
      .toEqual({ kind: "legacy", contextUnavailable: true });
  });

  it("uses only server-projected modes and preserves member-first defaults", () => {
    expect(resolveRoleShell({ roleShellsEnabled: true, context: context(), requestedMode: "invented" }))
      .toEqual({ kind: "role_aware", mode: "member" });
    expect(resolveRoleShell({ roleShellsEnabled: true, context: context(), requestedMode: "platform" }))
      .toEqual({ kind: "role_aware", mode: "platform" });
    expect(resolveRoleShell({ roleShellsEnabled: true, context: context({ member: false, management: true, platform: false }), requestedMode: "member" }))
      .toEqual({ kind: "role_aware", mode: "management" });
    expect(resolveRoleShell({ roleShellsEnabled: true, context: context({ member: false, management: false, platform: true }), requestedMode: "member" }))
      .toEqual({ kind: "role_aware", mode: "platform" });
  });
});

describe("role-aware navigation", () => {
  it("only emits implemented destinations and never treats platform clubs as an active club", () => {
    const projected = context();
    expect(roleShellNavigation(projected, "member").map((item) => item.href)).toEqual([
      "/dashboard?mode=member",
      "/events?mode=member",
      "/events/checkin?mode=member",
      "/directory?mode=member",
      "/me?mode=member",
    ]);
    expect(roleShellNavigation(projected, "management").map((item) => item.href)).toEqual([
      "/dashboard?mode=management",
      `/clubs/${memberClub.club_id}/members?mode=management`,
      `/clubs/${memberClub.club_id}/invitations?mode=management`,
      `/clubs/${memberClub.club_id}/identity?mode=management`,
    ]);
    expect(roleShellNavigation(projected, "platform").map((item) => item.href)).toEqual([
      "/dashboard?mode=platform",
      "/platform/clubs?mode=platform",
      "/platform/clubs/new?mode=platform",
    ]);
  });
});
