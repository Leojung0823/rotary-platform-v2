import { describe, expect, it } from "vitest";
import {
  activeClubForMode,
  applyActiveClubPreference,
  clubsForExperienceMode,
  parseExperienceContextProjection,
  resolveExperienceMode,
} from "./experience-context";

const clubA = {
  club_id: "10000000-0000-4000-8000-000000000001",
  club_code: "A",
  club_name: "Club A",
  can_manage: false,
};
const clubB = {
  club_id: "10000000-0000-4000-8000-000000000002",
  club_code: "B",
  club_name: "Club B",
  can_manage: false,
};
const managedClub = {
  club_id: "10000000-0000-4000-8000-000000000003",
  club_code: "M",
  club_name: "Managed Club",
  can_manage: true,
};

function projection({
  memberClubs = [],
  managedOnlyClubs = [],
  hasPlatformAccess = false,
}: {
  memberClubs?: Array<typeof clubA>;
  managedOnlyClubs?: Array<typeof managedClub>;
  hasPlatformAccess?: boolean;
} = {}) {
  const hasActiveMembership = memberClubs.length > 0;
  const canManage = memberClubs.some((club) => club.can_manage) || managedOnlyClubs.length > 0;
  const availableModes = [
    ...(hasActiveMembership ? ["member"] : []),
    ...(canManage ? ["management"] : []),
    ...(hasPlatformAccess ? ["platform"] : []),
  ];
  return {
    has_active_membership: hasActiveMembership,
    can_register: hasActiveMembership,
    can_manage: canManage,
    has_platform_access: hasPlatformAccess,
    member_clubs: memberClubs,
    managed_only_clubs: managedOnlyClubs,
    default_mode: availableModes[0] ?? null,
    available_modes: availableModes,
  };
}

function context(input = projection(), preferredClubId: unknown = null) {
  const parsed = parseExperienceContextProjection(input);
  expect(parsed).not.toBeNull();
  return applyActiveClubPreference(parsed!, preferredClubId);
}

describe("ExperienceContext role projection", () => {
  it("defaults an ordinary member to member mode", () => {
    const value = context(projection({ memberClubs: [clubA] }));
    expect(value).toMatchObject({
      hasActiveMembership: true,
      canRegister: true,
      canManage: false,
      hasPlatformAccess: false,
      defaultMode: "member",
      availableModes: ["member"],
      activeClubId: clubA.club_id,
    });
  });

  it("keeps multiple member clubs bounded and selects a legal persisted club", () => {
    const value = context(projection({ memberClubs: [clubA, clubB] }), clubB.club_id);
    expect(value.memberClubs).toHaveLength(2);
    expect(value.activeClubId).toBe(clubB.club_id);
    expect(activeClubForMode(value, "member")?.clubId).toBe(clubB.club_id);
  });

  it("defaults a management-only account to management mode", () => {
    const value = context(projection({ managedOnlyClubs: [managedClub] }));
    expect(value).toMatchObject({
      hasActiveMembership: false,
      canRegister: false,
      canManage: true,
      defaultMode: "management",
      availableModes: ["management"],
    });
    expect(clubsForExperienceMode(value, "management").map((club) => club.clubId)).toEqual([managedClub.club_id]);
  });

  it("defaults a member-manager to member mode while exposing management", () => {
    const value = context(projection({
      memberClubs: [{ ...clubA, can_manage: true }],
      managedOnlyClubs: [managedClub],
    }));
    expect(value.defaultMode).toBe("member");
    expect(value.availableModes).toEqual(["member", "management"]);
    expect(resolveExperienceMode(value, "management")).toBe("management");
    expect(clubsForExperienceMode(value, "management").map((club) => club.clubId)).toEqual([
      clubA.club_id,
      managedClub.club_id,
    ]);
  });

  it("defaults a platform-only account to platform mode", () => {
    const value = context(projection({ hasPlatformAccess: true }));
    expect(value).toMatchObject({
      hasActiveMembership: false,
      canManage: false,
      hasPlatformAccess: true,
      defaultMode: "platform",
      availableModes: ["platform"],
      activeClubId: null,
    });
  });

  it("defaults a platform administrator who is a member to member mode", () => {
    const value = context(projection({ memberClubs: [clubA], hasPlatformAccess: true }));
    expect(value.defaultMode).toBe("member");
    expect(value.availableModes).toEqual(["member", "platform"]);
  });
});

describe("active club preference safety", () => {
  it("falls back from a tampered or unauthorized cookie without widening club access", () => {
    const value = context(projection({ memberClubs: [clubA], managedOnlyClubs: [managedClub] }),
      "10000000-0000-4000-8000-000000000099");
    expect(value.activeClubId).toBe(clubA.club_id);

    const malformed = applyActiveClubPreference(value, "not-a-club");
    expect(malformed.activeClubId).toBe(clubA.club_id);
  });

  it("preserves a legal cookie on refresh and removes revoked membership immediately on the next projection", () => {
    const initial = context(projection({ memberClubs: [clubA, clubB] }), clubB.club_id);
    const refreshed = context(projection({ memberClubs: [clubA, clubB] }), initial.activeClubId);
    expect(refreshed.activeClubId).toBe(clubB.club_id);

    const afterRevocation = context(projection({ memberClubs: [clubA] }), initial.activeClubId);
    expect(afterRevocation.activeClubId).toBe(clubA.club_id);
  });

  it("rejects malformed, unbounded, and no-authority projections", () => {
    expect(parseExperienceContextProjection(projection())).toBeNull();
    expect(parseExperienceContextProjection({
      ...projection({ memberClubs: [clubA] }),
      member_clubs: Array.from({ length: 101 }, () => clubA),
    })).toBeNull();
    expect(parseExperienceContextProjection({
      ...projection({ memberClubs: [clubA] }),
      available_modes: ["member", "platform"],
    })).toBeNull();
  });
});
