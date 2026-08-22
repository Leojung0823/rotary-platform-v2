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
      "/directory?mode=member",
      "/interact?mode=member",
      "/me?mode=member",
    ]);
    expect(roleShellNavigation(projected, "management").map((item) => item.href)).toEqual([
      "/dashboard?mode=management",
      "/events?mode=management",
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

  it("gives a club-level manager a direct management link inline, not the platform mode switcher", () => {
    const managerContext = context({ member: true, management: true, platform: false });
    expect(roleShellNavigation(managerContext, "member").map((item) => item.id)).toEqual([
      // 我的 stays last, after the officer's inline management link.
      "home", "events", "directory", "interact", "manage-club", "account",
    ]);
    const manageItem = roleShellNavigation(managerContext, "member").find((item) => item.id === "manage-club");
    expect(manageItem?.href).toBe(`/clubs/${memberClub.club_id}/members?mode=management`);
  });

  it("keeps 我的 last and no longer spends a tab on check-in", () => {
    // Check-in is reached from the events page, where the member has already
    // chosen which event they are checking in to.
    for (const flags of [{}, { attendanceEnabled: true }]) {
      for (const projected of [context(), context({ member: true, management: true, platform: false })]) {
        const items = roleShellNavigation(projected, "member", flags);
        expect(items.some((item) => item.href.startsWith("/events/checkin"))).toBe(false);
        expect(items.at(-1)?.id).toBe("account");
      }
    }
  });

  it("does not add the inline manage-club link for a plain member without manage permission", () => {
    const plainMemberContext = context({ member: true, management: false, platform: false });
    expect(roleShellNavigation(plainMemberContext, "member").some((item) => item.id === "manage-club")).toBe(false);
  });

  it("does not duplicate the manage-club link for platform admins, who keep the mode switcher instead", () => {
    const platformContext = context({ member: true, management: true, platform: true });
    expect(roleShellNavigation(platformContext, "member").some((item) => item.id === "manage-club")).toBe(false);
  });

  it("adds the complete blessing IOU domain only to management navigation when enabled", () => {
    const projected = context();
    expect(roleShellNavigation(projected, "management", { blessingIouEnabled: true }).map((item) => item.id))
      .toEqual(["overview", "events", "members", "invitations", "blessing-iou", "club-settings"]);
    expect(roleShellNavigation(projected, "management", { blessingIouEnabled: true })
      .find((item) => item.id === "blessing-iou")?.href)
      .toBe(`/clubs/${memberClub.club_id}/blessing-iou?mode=management`);
    expect(roleShellNavigation(projected, "member", { blessingIouEnabled: true })
      .some((item) => item.id === "blessing-iou")).toBe(false);
  });

  it("gives a club officer a way back out of management mode", () => {
    // A president is a member who also manages. Without the mode switcher --
    // which only platform admins get -- the inline management link would be a
    // one-way door.
    const officer = context({ member: true, management: true, platform: false });
    const memberNav = roleShellNavigation(officer, "member");
    const managementNav = roleShellNavigation(officer, "management");

    expect(memberNav.find((item) => item.id === "manage-club")).toBeTruthy();
    const back = managementNav.find((item) => item.id === "member-mode");
    expect(back?.href).toBe("/dashboard?mode=member");
    // Crossing a mode boundary needs a full navigation, not a soft one.
    expect(back?.forceReload).toBe(true);
  });

  it("does not offer a member mode to an operator who has no membership", () => {
    const operator = context({ member: false, management: true, platform: false });
    expect(roleShellNavigation(operator, "management").some((item) => item.id === "member-mode"))
      .toBe(false);
  });

  it("leaves the platform admin's mode switcher as the only way to change mode", () => {
    const admin = context({ member: true, management: true, platform: true });
    expect(roleShellNavigation(admin, "management").some((item) => item.id === "member-mode"))
      .toBe(false);
  });

  it("hides attendance entirely while the flag is off, so the nav never links to a notFound page", () => {
    const projected = context();
    for (const mode of ["member", "management"] as const) {
      expect(roleShellNavigation(projected, mode).some((item) => item.id === "attendance")).toBe(false);
    }
  });

  it("gives management an attendance tab and keeps the member's own inside 我的", () => {
    const projected = context();
    const member = roleShellNavigation(projected, "member", { attendanceEnabled: true });
    const management = roleShellNavigation(projected, "management", { attendanceEnabled: true });

    // Rosters and adjustments are repeated work and earn a tab. A member's own
    // rate is checked occasionally, so it lives in 我的 rather than the bar.
    expect(management.find((item) => item.id === "attendance")?.href)
      .toBe("/attendance/manage?mode=management");
    expect(member.some((item) => item.id === "attendance")).toBe(false);
    expect(member.some((item) => item.href.startsWith("/attendance"))).toBe(false);

    expect(member.map((item) => item.id))
      .toEqual(["home", "events", "directory", "interact", "account"]);
    expect(management.map((item) => item.id))
      .toEqual(["overview", "events", "attendance", "members", "invitations", "club-settings"]);
  });
});

describe("message centre navigation", () => {
  const projected = context();

  it("is absent until the feature is enabled, then reachable from member and management", () => {
    expect(roleShellNavigation(projected, "member").some((item) => item.id === "messages")).toBe(false);
    expect(roleShellNavigation(projected, "member", { messageCenterEnabled: true })
      .find((item) => item.id === "messages")?.href).toBe("/messages?mode=member");
    expect(roleShellNavigation(projected, "management", { messageCenterEnabled: true })
      .find((item) => item.id === "messages")?.href).toBe("/messages?mode=management");
    expect(roleShellNavigation(projected, "platform", { messageCenterEnabled: true })
      .some((item) => item.id === "messages")).toBe(false);
  });

  it("carries a badge only while something is unread", () => {
    const withoutUnread = roleShellNavigation(projected, "member", { messageCenterEnabled: true })
      .find((item) => item.id === "messages");
    expect(withoutUnread?.badgeCount).toBeUndefined();

    const withUnread = roleShellNavigation(projected, "member", {
      messageCenterEnabled: true,
      unreadMessageCount: 3,
    }).find((item) => item.id === "messages");
    expect(withUnread?.badgeCount).toBe(3);
  });

  it("keeps 我的 last in member navigation", () => {
    const items = roleShellNavigation(projected, "member", {
      messageCenterEnabled: true,
      unreadMessageCount: 2,
    });
    expect(items.at(-1)?.id).toBe("account");
  });
});
