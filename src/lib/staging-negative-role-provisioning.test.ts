import { describe, expect, it } from "vitest";
import {
  deriveStagingNegativeRoleClubCode,
  deriveStagingNegativeRoleClubName,
  inspectStagingNegativeRoleProvisioningInput,
  provisionStagingNegativeRoleIdentities,
  STAGING_NEGATIVE_ROLE_DISPLAY_NAMES,
} from "./staging-negative-role-provisioning.mjs";

const projectRef = "abcdefghijklmnopqrst";
const targetClubName = "Rotary Platform Staging Test Club";
const suspendedEmail = "staging-suspended@example.test";
const endedEmail = "staging-ended@example.test";
const outsiderEmail = "staging-outsider-secretary@example.test";
const passwords = {
  suspended: `suspended-${"x".repeat(24)}`,
  ended: `ended-${"y".repeat(24)}`,
  outsider: `outsider-${"z".repeat(24)}`,
};

type FakeAuthUser = {
  id: string;
  email: string;
  password: string;
  email_confirmed_at: string;
  user_metadata: { display_name: string; staging_test_identity: boolean };
};
type FakePerson = {
  id: string;
  canonical_name: string;
  primary_email: string;
  primary_phone: string | null;
  birth_date: string | null;
  avatar_url: string | null;
};
type FakeAccount = {
  id: string;
  auth_user_id: string;
  person_id: string;
  login_email_normalized: string;
  account_display_name: string;
  account_status: string;
};
type FakeMembership = {
  id: string;
  club_id: string;
  person_id: string;
  membership_status: string;
  joined_on: string;
  ended_on: string | null;
};
type FakePermission = {
  id: string;
  club_id: string;
  app_account_id: string;
  operator_role_key: string;
  permission_level: string;
};

function validInput(overrides: Record<string, string> = {}) {
  return {
    STAGING_PROVISION_NEGATIVE_ROLES: "true",
    STAGING_NEGATIVE_ROLE_PROVISIONING_CONFIRMATION: "PROVISION-STAGING-NEGATIVE-ROLES",
    STAGING_BACKUP_CONFIRMATION: "BACKUP-READY",
    STAGING_PROJECT_IDENTITY_CONFIRMATION: "STAGING-PROJECT-VERIFIED",
    APP_ENV: "staging",
    TRUSTED_ADMIN_ENVIRONMENT: "staging",
    STAGING_BASE_URL: "https://rotary-platform-v2-mrha.onrender.com",
    SUPABASE_PROJECT_REF: projectRef,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    STAGING_EXPECTED_CLUB_NAME: targetClubName,
    SUPABASE_SERVICE_ROLE_KEY: "service-role-".padEnd(48, "s"),
    STAGING_TEST_SUSPENDED_EMAIL: suspendedEmail,
    STAGING_TEST_SUSPENDED_PASSWORD: passwords.suspended,
    STAGING_TEST_ENDED_EMAIL: endedEmail,
    STAGING_TEST_ENDED_PASSWORD: passwords.ended,
    STAGING_TEST_OUTSIDER_SECRETARY_EMAIL: outsiderEmail,
    STAGING_TEST_OUTSIDER_SECRETARY_PASSWORD: passwords.outsider,
    ...overrides,
  };
}

function fakeAdapter() {
  const targetClub = {
    id: "club-target",
    club_code: "STG-TARGET",
    club_name: targetClubName,
    club_status: "active",
    created_by_app_account_id: null,
  };
  const state = {
    clubs: [targetClub],
    authUsers: [] as FakeAuthUser[],
    people: [] as FakePerson[],
    accounts: [] as FakeAccount[],
    memberships: [] as FakeMembership[],
    platformRoles: [] as Array<{ id: string; app_account_id: string; role_key: string }>,
    operatorPermissions: [] as FakePermission[],
    clubRoles: [] as Array<{ id: string; app_account_id: string; club_id: string; role_key: string }>,
    audits: new Set<string>(),
  };
  let nextId = 1;
  const id = (prefix: string) => `${prefix}-${nextId++}`;
  const adapter = {
    state,
    async findClubsByName(name: string) { return state.clubs.filter((row) => row.club_name === name); },
    async findClubsByCode(code: string) { return state.clubs.filter((row) => row.club_code === code); },
    async createClub({ clubCode, clubName }: { clubCode: string; clubName: string }) {
      const row = {
        id: id("club"), club_code: clubCode, club_name: clubName,
        club_status: "active", created_by_app_account_id: null,
      };
      state.clubs.push(row);
      return row;
    },
    async findAuthUsersByEmail(email: string) { return state.authUsers.filter((row) => row.email === email); },
    async createAuthUser({ email, password, displayName }: { email: string; password: string; displayName: string }) {
      const row = {
        id: id("auth"), email, password, email_confirmed_at: "2026-09-20T00:00:00Z",
        user_metadata: { display_name: displayName, staging_test_identity: true },
      };
      state.authUsers.push(row);
      return row;
    },
    async verifyPasswordLogin(email: string, password: string) {
      return state.authUsers.some((row) => row.email === email && row.password === password);
    },
    async findPeopleByEmail(email: string) { return state.people.filter((row) => row.primary_email === email); },
    async createPerson({ email, displayName }: { email: string; displayName: string }) {
      const row = {
        id: id("person"), canonical_name: displayName, primary_email: email,
        primary_phone: null, birth_date: null, avatar_url: null,
      };
      state.people.push(row);
      return row;
    },
    async findAccountsByAuthUserId(authUserId: string) {
      return state.accounts.filter((row) => row.auth_user_id === authUserId);
    },
    async findAccountsByEmail(email: string) {
      return state.accounts.filter((row) => row.login_email_normalized === email);
    },
    async findAccountsByPersonId(personId: string) {
      return state.accounts.filter((row) => row.person_id === personId);
    },
    async createAccount({ authUserId, personId, email, displayName }: {
      authUserId: string; personId: string; email: string; displayName: string;
    }) {
      const row = {
        id: id("account"), auth_user_id: authUserId, person_id: personId,
        login_email_normalized: email, account_display_name: displayName, account_status: "active",
      };
      state.accounts.push(row);
      return row;
    },
    async listMembershipsForPerson(personId: string) {
      return state.memberships.filter((row) => row.person_id === personId);
    },
    async createMembership({ clubId, personId, membershipStatus, joinedOn, endedOn }: {
      clubId: string; personId: string; membershipStatus: string; joinedOn: string; endedOn: string | null;
    }) {
      const row = {
        id: id("membership"), club_id: clubId, person_id: personId,
        membership_status: membershipStatus, joined_on: joinedOn, ended_on: endedOn,
      };
      state.memberships.push(row);
      return row;
    },
    async updateMembership({ membershipId, membershipStatus, joinedOn, endedOn }: {
      membershipId: string; membershipStatus: string; joinedOn: string; endedOn: string | null;
    }) {
      const row = state.memberships.find((candidate) => candidate.id === membershipId);
      if (!row) throw new Error("missing membership");
      Object.assign(row, { membership_status: membershipStatus, joined_on: joinedOn, ended_on: endedOn });
      return row;
    },
    async listActivePlatformRoles(accountId: string) {
      return state.platformRoles.filter((row) => row.app_account_id === accountId);
    },
    async listActiveOperatorPermissions(accountId: string) {
      return state.operatorPermissions.filter((row) => row.app_account_id === accountId);
    },
    async listActiveClubRoles(accountId: string) {
      return state.clubRoles.filter((row) => row.app_account_id === accountId);
    },
    async createOperatorPermission({ clubId, accountId }: { clubId: string; accountId: string }) {
      const row = {
        id: id("operator"), club_id: clubId, app_account_id: accountId,
        operator_role_key: "executive_secretary", permission_level: "club_manager",
      };
      state.operatorPermissions.push(row);
      return row;
    },
    async normalizeOperatorPermission({ permissionId }: { permissionId: string }) {
      const row = state.operatorPermissions.find((candidate) => candidate.id === permissionId);
      if (!row) throw new Error("missing operator permission");
      row.permission_level = "club_manager";
      row.operator_role_key = "executive_secretary";
      return row;
    },
    async ensureAuditEvent({ actionKey, subjectType }: { actionKey: string; subjectType: string }) {
      state.audits.add(`${actionKey}:${subjectType}`);
    },
  };
  return adapter;
}

describe("staging negative-role provisioning input", () => {
  it("does not require staging values when disabled", () => {
    expect(inspectStagingNegativeRoleProvisioningInput({ STAGING_PROVISION_NEGATIVE_ROLES: "false" })).toEqual({
      ok: true,
      enabled: false,
      credentialsConfigured: false,
      errors: [],
    });
  });

  it("requires staging gates, reserved identities and distinct credentials", () => {
    const result = inspectStagingNegativeRoleProvisioningInput(validInput({
      APP_ENV: "production",
      STAGING_PROJECT_IDENTITY_CONFIRMATION: "",
      STAGING_TEST_ENDED_EMAIL: suspendedEmail,
      STAGING_TEST_SUSPENDED_PASSWORD: "short",
    }));
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_APP_ENV_REQUIRED",
      "STAGING_PROJECT_IDENTITY_CONFIRMATION_MISMATCH",
      "STAGING_NEGATIVE_ROLE_IDENTITIES_MUST_DIFFER",
      "STAGING_TEST_SUSPENDED_PASSWORD_INVALID",
    ]));
  });
});

describe("staging negative-role provisioning", () => {
  it("creates suspended, ended and cross-club secretary fixtures", async () => {
    const adapter = fakeAdapter();
    const result = await provisionStagingNegativeRoleIdentities(validInput(), adapter);

    expect(result).toEqual({
      ok: true,
      enabled: true,
      idempotent: false,
      created: {
        negativeClub: true,
        suspended: true,
        ended: true,
        outsiderSecretary: true,
      },
    });
    expect(adapter.state.clubs).toHaveLength(2);
    expect(adapter.state.clubs[1]).toMatchObject({
      club_code: deriveStagingNegativeRoleClubCode(targetClubName),
      club_name: deriveStagingNegativeRoleClubName(targetClubName),
      club_status: "active",
    });
    expect(adapter.state.people.map((row) => row.canonical_name)).toEqual([
      STAGING_NEGATIVE_ROLE_DISPLAY_NAMES.suspended,
      STAGING_NEGATIVE_ROLE_DISPLAY_NAMES.ended,
      STAGING_NEGATIVE_ROLE_DISPLAY_NAMES.outsider,
    ]);
    expect(adapter.state.memberships.map((row) => row.membership_status)).toEqual(["suspended", "ended"]);
    expect(adapter.state.memberships[1]).toMatchObject({ ended_on: "2020-12-31" });
    expect(adapter.state.operatorPermissions).toHaveLength(1);
    expect(adapter.state.operatorPermissions[0]).toMatchObject({
      club_id: adapter.state.clubs[1].id,
      operator_role_key: "executive_secretary",
      permission_level: "club_manager",
    });
    expect(adapter.state.platformRoles).toHaveLength(0);
    expect(adapter.state.clubRoles).toHaveLength(0);
    expect(adapter.state.audits.size).toBe(4);
  });

  it("is idempotent and does not duplicate test identities", async () => {
    const adapter = fakeAdapter();
    await provisionStagingNegativeRoleIdentities(validInput(), adapter);
    const second = await provisionStagingNegativeRoleIdentities(validInput(), adapter);

    expect(second.idempotent).toBe(true);
    expect(adapter.state.authUsers).toHaveLength(3);
    expect(adapter.state.people).toHaveLength(3);
    expect(adapter.state.accounts).toHaveLength(3);
    expect(adapter.state.memberships).toHaveLength(2);
    expect(adapter.state.operatorPermissions).toHaveLength(1);
  });

  it("fails closed when a reserved account has another-club membership", async () => {
    const adapter = fakeAdapter();
    await provisionStagingNegativeRoleIdentities(validInput(), adapter);
    const suspended = adapter.state.accounts.find((account) => account.login_email_normalized === suspendedEmail);
    if (!suspended) throw new Error("test fixture account missing");
    adapter.state.memberships.push({
      id: "membership-other-club",
      club_id: "club-other",
      person_id: suspended.person_id,
      membership_status: "suspended",
      joined_on: "2020-01-01",
      ended_on: null,
    });

    await expect(provisionStagingNegativeRoleIdentities(validInput(), adapter))
      .rejects.toThrow("NEGATIVE_ROLE_MEMBERSHIP_TENANT_CONFLICT");
  });
});
