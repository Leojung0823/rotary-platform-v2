import { describe, expect, it } from "vitest";
import {
  deriveStagingClubCode,
  inspectStagingProvisioningInput,
  provisionStagingTestData,
  STAGING_TEST_MEMBER_DISPLAY_NAME,
} from "./staging-provisioning.mjs";

const projectRef = "abcdefghijklmnopqrst";
const email = ["staging-member", "example.test"].join("@");
const password = `unit-${"x".repeat(24)}`;
const clubName = "Rotary Staging Test Club";

type Club = {
  id: string;
  club_code: string;
  club_name: string;
  club_status: string;
  created_by_app_account_id: null;
};
type AuthUser = {
  id: string;
  email: string;
  password: string;
  email_confirmed_at: string | null;
  user_metadata: { display_name: string; staging_test_identity?: boolean };
};
type Person = {
  id: string;
  canonical_name: string;
  primary_email: string;
  primary_phone: string | null;
  birth_date: string | null;
  avatar_url: string | null;
};
type Account = {
  id: string;
  auth_user_id: string;
  person_id: string;
  login_email_normalized: string;
  account_display_name: string;
  account_status: string;
};
type Membership = {
  id: string;
  club_id: string;
  person_id: string;
  membership_status: string;
};
type AccountRole = { app_account_id: string; role_key: string; club_id?: string };
type OperatorPermission = { app_account_id: string; club_id: string; operator_role_key: string };

function validInput() {
  return {
    STAGING_PROVISION_TEST_DATA: "true",
    STAGING_PROVISIONING_CONFIRMATION: "PROVISION-STAGING-TEST-DATA",
    APP_ENV: "staging",
    TRUSTED_ADMIN_ENVIRONMENT: "staging",
    STAGING_BACKUP_CONFIRMATION: "BACKUP-READY",
    STAGING_SHA_VERIFIED: "true",
    STAGING_PLAN_VERIFIED: "true",
    STAGING_PROJECT_IDENTITY_VERIFIED: "true",
    SUPABASE_PROJECT_REF: projectRef,
    NEXT_PUBLIC_SUPABASE_URL: `https://${projectRef}.supabase.co`,
    STAGING_EXPECTED_CLUB_NAME: clubName,
    STAGING_TEST_MEMBER_EMAIL: email,
    STAGING_TEST_MEMBER_PASSWORD: password,
    SUPABASE_SERVICE_ROLE_KEY: "service-role-".padEnd(48, "s"),
  };
}

function fakeAdapter() {
  const state = {
    clubs: [] as Club[],
    authUsers: [] as AuthUser[],
    people: [] as Person[],
    accounts: [] as Account[],
    memberships: [] as Membership[],
    platformRoles: [] as AccountRole[],
    operatorPermissions: [] as OperatorPermission[],
    clubRoles: [] as AccountRole[],
    audits: new Set<string>(),
  };
  let nextId = 1;
  const id = (prefix: string) => `${prefix}-${nextId++}`;

  const adapter = {
    state,
    async findClubsByName(name: string) { return state.clubs.filter((row) => row.club_name === name); },
    async findClubsByCode(code: string) { return state.clubs.filter((row) => row.club_code === code); },
    async createClub({ clubCode, clubName: name }: { clubCode: string; clubName: string }) {
      const row = { id: id("club"), club_code: clubCode, club_name: name, club_status: "active", created_by_app_account_id: null };
      state.clubs.push(row);
      return row;
    },
    async findAuthUsersByEmail(target: string) { return state.authUsers.filter((row) => row.email === target); },
    async createAuthUser(input: { email: string; password: string; displayName: string }) {
      const row = {
        id: id("auth"), email: input.email, password: input.password,
        email_confirmed_at: "2026-07-31T00:00:00Z",
        user_metadata: { display_name: input.displayName, staging_test_identity: true },
      };
      state.authUsers.push(row);
      return row;
    },
    async verifyPasswordLogin(target: string, supplied: string) {
      return state.authUsers.some((row) => row.email === target && row.password === supplied);
    },
    async findPeopleByEmail(target: string) { return state.people.filter((row) => row.primary_email === target); },
    async createPerson(input: { email: string; displayName: string }) {
      const row = {
        id: id("person"), canonical_name: input.displayName, primary_email: input.email,
        primary_phone: null, birth_date: null, avatar_url: null,
      };
      state.people.push(row);
      return row;
    },
    async findAccountsByAuthUserId(target: string) { return state.accounts.filter((row) => row.auth_user_id === target); },
    async findAccountsByEmail(target: string) { return state.accounts.filter((row) => row.login_email_normalized === target); },
    async findAccountsByPersonId(target: string) { return state.accounts.filter((row) => row.person_id === target); },
    async createAccount(input: { authUserId: string; personId: string; email: string; displayName: string }) {
      const row = {
        id: id("account"), auth_user_id: input.authUserId, person_id: input.personId,
        login_email_normalized: input.email, account_display_name: input.displayName, account_status: "active",
      };
      state.accounts.push(row);
      return row;
    },
    async listMembershipsForPerson(target: string) { return state.memberships.filter((row) => row.person_id === target); },
    async createMembership(input: { clubId: string; personId: string }) {
      const row = { id: id("membership"), club_id: input.clubId, person_id: input.personId, membership_status: "active" };
      state.memberships.push(row);
      return row;
    },
    async listActivePlatformRoles(target: string) { return state.platformRoles.filter((row) => row.app_account_id === target); },
    async listActiveOperatorPermissions(target: string) { return state.operatorPermissions.filter((row) => row.app_account_id === target); },
    async listActiveClubRoles(target: string) { return state.clubRoles.filter((row) => row.app_account_id === target); },
    async ensureAuditEvent(input: { clubId: string; actionKey: string; subjectType: string; subjectId: string }) {
      state.audits.add(`${input.actionKey}:${input.subjectId}`);
    },
    async verifyMemberAccess(input: { email: string; password: string; clubName: string }) {
      const auth = state.authUsers.find((row) => row.email === input.email && row.password === input.password);
      const account = state.accounts.find((row) => row.auth_user_id === auth?.id && row.account_status === "active");
      const person = state.people.find((row) => row.id === account?.person_id);
      const membership = state.memberships.find((row) => row.person_id === person?.id && row.membership_status === "active");
      const club = state.clubs.find((row) => row.id === membership?.club_id && row.club_status === "active");
      return club?.club_name === input.clubName && Boolean(person?.canonical_name && (person.primary_email || person.primary_phone));
    },
  };
  return adapter;
}

describe("initial staging provisioning input", () => {
  it("does not require service-role when provisioning is disabled", () => {
    expect(inspectStagingProvisioningInput({ STAGING_PROVISION_TEST_DATA: "false" })).toEqual({
      ok: true,
      enabled: false,
      credentialsConfigured: false,
      errors: [],
    });
  });

  it("requires the exact enable confirmation, service-role and strong password", () => {
    const result = inspectStagingProvisioningInput({
      ...validInput(),
      STAGING_PROVISIONING_CONFIRMATION: "PROVISION",
      SUPABASE_SERVICE_ROLE_KEY: "",
      STAGING_TEST_MEMBER_PASSWORD: "short",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "STAGING_PROVISIONING_CONFIRMATION_MISMATCH",
      "SUPABASE_SERVICE_ROLE_KEY_INVALID",
      "STAGING_TEST_MEMBER_PASSWORD_INVALID",
    ]));
  });

  it("rejects production, hostname mismatch and missing prior gates", () => {
    const result = inspectStagingProvisioningInput({
      ...validInput(),
      APP_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co",
      STAGING_BACKUP_CONFIRMATION: "",
      STAGING_SHA_VERIFIED: "",
      STAGING_PLAN_VERIFIED: "",
      STAGING_PROJECT_IDENTITY_VERIFIED: "",
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      "PRODUCTION_PROVISIONING_FORBIDDEN",
      "STAGING_SUPABASE_HOST_REF_MISMATCH",
      "STAGING_BACKUP_CONFIRMATION_MISMATCH",
      "STAGING_SHA_NOT_VERIFIED",
      "STAGING_PLAN_NOT_VERIFIED",
      "STAGING_PROJECT_IDENTITY_NOT_VERIFIED",
    ]));
  });
});

describe("initial staging provisioning", () => {
  it("creates the exact pure-test data without privileged roles", async () => {
    const adapter = fakeAdapter();
    const result = await provisionStagingTestData(validInput(), adapter);
    expect(result).toEqual({
      ok: true,
      enabled: true,
      idempotent: false,
      created: { club: true, authUser: true, person: true, account: true, membership: true },
    });
    expect(adapter.state.clubs[0]).toMatchObject({
      club_name: clubName,
      club_code: deriveStagingClubCode(clubName),
      club_status: "active",
    });
    expect(adapter.state.authUsers[0]).toMatchObject({ email, email_confirmed_at: expect.any(String) });
    expect(adapter.state.people[0]).toMatchObject({
      canonical_name: STAGING_TEST_MEMBER_DISPLAY_NAME,
      primary_email: email,
      primary_phone: null,
      birth_date: null,
    });
    expect(adapter.state.accounts[0]).toMatchObject({ account_status: "active" });
    expect(adapter.state.memberships[0]).toMatchObject({ membership_status: "active" });
    expect(adapter.state.platformRoles).toHaveLength(0);
    expect(adapter.state.operatorPermissions).toHaveLength(0);
    expect(adapter.state.clubRoles).toHaveLength(0);
    expect(adapter.state.audits.size).toBe(5);
  });

  it("is idempotent on the second execution", async () => {
    const adapter = fakeAdapter();
    await provisionStagingTestData(validInput(), adapter);
    const before = JSON.stringify({
      clubs: adapter.state.clubs,
      authUsers: adapter.state.authUsers,
      people: adapter.state.people,
      accounts: adapter.state.accounts,
      memberships: adapter.state.memberships,
    });
    const second = await provisionStagingTestData(validInput(), adapter);
    expect(second.idempotent).toBe(true);
    expect(JSON.stringify({
      clubs: adapter.state.clubs,
      authUsers: adapter.state.authUsers,
      people: adapter.state.people,
      accounts: adapter.state.accounts,
      memberships: adapter.state.memberships,
    })).toBe(before);
    expect(adapter.state.audits.size).toBe(5);
  });

  it("rejects an Auth user conflict without overwriting it", async () => {
    const adapter = fakeAdapter();
    adapter.state.authUsers.push({
      id: "auth-existing", email, password, email_confirmed_at: null,
      user_metadata: { display_name: "Real Person" },
    });
    await expect(provisionStagingTestData(validInput(), adapter)).rejects.toThrow("AUTH_USER_CONFLICT");
    expect(adapter.state.people).toHaveLength(0);
  });

  it("rejects person and account identity conflicts", async () => {
    const personConflict = fakeAdapter();
    personConflict.state.people.push({
      id: "person-real", canonical_name: "Real Person", primary_email: email,
      primary_phone: null, birth_date: null, avatar_url: null,
    });
    await expect(provisionStagingTestData(validInput(), personConflict)).rejects.toThrow("PERSON_CONFLICT");

    const accountConflict = fakeAdapter();
    await provisionStagingTestData(validInput(), accountConflict);
    accountConflict.state.accounts[0].account_display_name = "Different Account";
    await expect(provisionStagingTestData(validInput(), accountConflict)).rejects.toThrow("ACCOUNT_IDENTITY_CONFLICT");
  });

  it("rejects club and membership tenant conflicts", async () => {
    const clubConflict = fakeAdapter();
    clubConflict.state.clubs.push({
      id: "club-real", club_code: "PROD", club_name: clubName,
      club_status: "active", created_by_app_account_id: null,
    });
    await expect(provisionStagingTestData(validInput(), clubConflict)).rejects.toThrow("CLUB_TENANT_IDENTITY_CONFLICT");

    const membershipConflict = fakeAdapter();
    await provisionStagingTestData(validInput(), membershipConflict);
    membershipConflict.state.memberships[0].club_id = "another-club";
    await expect(provisionStagingTestData(validInput(), membershipConflict)).rejects.toThrow("MEMBERSHIP_TENANT_CONFLICT");
  });

  it("rejects any management privilege on the test account", async () => {
    const adapter = fakeAdapter();
    await provisionStagingTestData(validInput(), adapter);
    adapter.state.platformRoles.push({ app_account_id: adapter.state.accounts[0].id, role_key: "superadmin" });
    await expect(provisionStagingTestData(validInput(), adapter)).rejects.toThrow("TEST_ACCOUNT_PRIVILEGE_CONFLICT");
  });

  it("never serializes raw secrets, Email or identifiers in results and errors", async () => {
    const adapter = fakeAdapter();
    const input = validInput();
    const result = await provisionStagingTestData(input, adapter);
    const serialized = JSON.stringify(result);
    for (const sensitive of [
      input.SUPABASE_SERVICE_ROLE_KEY,
      input.STAGING_TEST_MEMBER_PASSWORD,
      input.STAGING_TEST_MEMBER_EMAIL,
      adapter.state.authUsers[0].id,
      adapter.state.people[0].id,
      adapter.state.accounts[0].id,
      adapter.state.clubs[0].id,
      adapter.state.memberships[0].id,
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });
});
