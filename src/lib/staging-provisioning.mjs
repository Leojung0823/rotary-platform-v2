import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { isPublicHostname } from "./public-hostname.mjs";

const DISPLAY_NAME = "Staging Test Member";
const PROJECT_REF_PATTERN = /^[a-z0-9]{16,32}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const TEST_MARKER_PATTERN = /(?:staging|test|測試)/iu;
const RESERVED_TEST_DOMAIN_PATTERN = /(?:^|\.)(?:example\.(?:com|net|org)|test|invalid|example)$/iu;

/** @typedef {{id: string, club_code: string, club_name: string, club_status: string, created_by_app_account_id: string | null}} ProvisionedClub */
/** @typedef {{id: string, email?: string | null, email_confirmed_at?: string | null, user_metadata?: Record<string, unknown>}} ProvisionedAuthUser */
/** @typedef {{id: string, canonical_name: string, primary_email: string | null, primary_phone: string | null, birth_date: string | null, avatar_url: string | null}} ProvisionedPerson */
/** @typedef {{id: string, auth_user_id: string, person_id: string, login_email_normalized: string, account_display_name: string, account_status: string}} ProvisionedAccount */
/** @typedef {{id: string, club_id: string, person_id: string, membership_status: string}} ProvisionedMembership */
/** @typedef {{club_id?: string | null, role_key?: string}} ProvisionedRole */
/**
 * @typedef {object} StagingProvisioningAdapter
 * @property {(clubName: string) => Promise<ProvisionedClub[]>} findClubsByName
 * @property {(clubCode: string) => Promise<ProvisionedClub[]>} findClubsByCode
 * @property {(input: {clubCode: string, clubName: string}) => Promise<ProvisionedClub>} createClub
 * @property {(email: string) => Promise<ProvisionedAuthUser[]>} findAuthUsersByEmail
 * @property {(input: {email: string, password: string, displayName: string}) => Promise<ProvisionedAuthUser>} createAuthUser
 * @property {(email: string, password: string) => Promise<boolean>} verifyPasswordLogin
 * @property {(email: string) => Promise<ProvisionedPerson[]>} findPeopleByEmail
 * @property {(input: {email: string, displayName: string}) => Promise<ProvisionedPerson>} createPerson
 * @property {(authUserId: string) => Promise<ProvisionedAccount[]>} findAccountsByAuthUserId
 * @property {(email: string) => Promise<ProvisionedAccount[]>} findAccountsByEmail
 * @property {(personId: string) => Promise<ProvisionedAccount[]>} findAccountsByPersonId
 * @property {(input: {authUserId: string, personId: string, email: string, displayName: string}) => Promise<ProvisionedAccount>} createAccount
 * @property {(personId: string) => Promise<ProvisionedMembership[]>} listMembershipsForPerson
 * @property {(input: {clubId: string, personId: string}) => Promise<ProvisionedMembership>} createMembership
 * @property {(accountId: string) => Promise<ProvisionedRole[]>} listActivePlatformRoles
 * @property {(accountId: string) => Promise<ProvisionedRole[]>} listActiveOperatorPermissions
 * @property {(accountId: string) => Promise<ProvisionedRole[]>} listActiveClubRoles
 * @property {(input: {actionKey: string, subjectType: string}) => Promise<void>} ensureAuditEvent
 * @property {(input: {email: string, password: string, clubName: string}) => Promise<boolean>} verifyMemberAccess
 */

function text(value) {
  return String(value ?? "").trim();
}

function normalizedEmail(value) {
  return text(value).toLowerCase();
}

/** @returns {never} */
function fail(code) {
  const error = new Error(code);
  error.name = "StagingProvisioningError";
  throw error;
}

function unique(rows, code) {
  if (!Array.isArray(rows) || rows.length > 1) fail(code);
  return rows[0] ?? null;
}

function sameIdentity(rows) {
  const present = rows.filter(Boolean);
  if (present.length <= 1) return present[0] ?? null;
  if (present.some((row) => row.id !== present[0].id)) fail("ACCOUNT_IDENTITY_CONFLICT");
  return present[0];
}

function isClearlyTestEmail(email) {
  const [localPart, domain] = email.split("@");
  return TEST_MARKER_PATTERN.test(localPart ?? "") && RESERVED_TEST_DOMAIN_PATTERN.test(domain ?? "");
}

/**
 * Derive a deterministic, non-business club code without adding another manual input.
 * @param {string} clubName
 */
export function deriveStagingClubCode(clubName) {
  const normalized = text(clubName).normalize("NFKC").toLowerCase();
  const digest = createHash("sha256")
    .update(`rotary-platform-v2:v0.7-staging-club:${normalized}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return `STG-${digest}`;
}

/**
 * Validate one explicitly enabled initial staging provisioning run.
 * Credential values are inspected but never returned.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function inspectStagingProvisioningInput(input = process.env) {
  const errors = [];
  const rawEnabled = text(input.STAGING_PROVISION_TEST_DATA).toLowerCase();
  const enabled = rawEnabled === "true";

  if (!new Set(["true", "false"]).has(rawEnabled)) {
    errors.push("STAGING_PROVISION_TEST_DATA_INVALID");
  }
  if (!enabled) {
    return {
      ok: errors.length === 0,
      enabled: false,
      credentialsConfigured: false,
      errors,
    };
  }

  const projectRef = text(input.SUPABASE_PROJECT_REF);
  const rawUrl = text(input.NEXT_PUBLIC_SUPABASE_URL ?? input.SUPABASE_URL);
  const clubName = text(input.STAGING_EXPECTED_CLUB_NAME);
  const email = normalizedEmail(input.STAGING_TEST_MEMBER_EMAIL);
  const password = String(input.STAGING_TEST_MEMBER_PASSWORD ?? "");
  const serviceRoleKey = String(input.SUPABASE_SERVICE_ROLE_KEY ?? "");
  let parsed = null;

  if (text(input.STAGING_PROVISIONING_CONFIRMATION) !== "PROVISION-STAGING-TEST-DATA") {
    errors.push("STAGING_PROVISIONING_CONFIRMATION_MISMATCH");
  }
  if (text(input.APP_ENV) === "production") errors.push("PRODUCTION_PROVISIONING_FORBIDDEN");
  if (text(input.APP_ENV) !== "staging") errors.push("STAGING_APP_ENV_REQUIRED");
  if (text(input.TRUSTED_ADMIN_ENVIRONMENT) !== "staging") {
    errors.push("STAGING_TRUSTED_BOUNDARY_REQUIRED");
  }
  if (text(input.STAGING_BACKUP_CONFIRMATION) !== "BACKUP-READY") {
    errors.push("STAGING_BACKUP_CONFIRMATION_MISMATCH");
  }
  if (text(input.STAGING_SHA_VERIFIED) !== "true") errors.push("STAGING_SHA_NOT_VERIFIED");
  if (text(input.STAGING_PLAN_VERIFIED) !== "true") errors.push("STAGING_PLAN_NOT_VERIFIED");
  if (text(input.STAGING_PROJECT_IDENTITY_VERIFIED) !== "true") {
    errors.push("STAGING_PROJECT_IDENTITY_NOT_VERIFIED");
  }
  if (!PROJECT_REF_PATTERN.test(projectRef)) errors.push("SUPABASE_PROJECT_REF_INVALID");

  try {
    parsed = new URL(rawUrl);
  } catch {
    errors.push("STAGING_SUPABASE_URL_INVALID");
  }
  if (parsed) {
    if (parsed.protocol !== "https:" || parsed.username || parsed.password
      || parsed.pathname !== "/" || parsed.search || parsed.hash
      || !isPublicHostname(parsed.hostname)) {
      errors.push("STAGING_SUPABASE_HTTPS_ORIGIN_REQUIRED");
    }
    if (PROJECT_REF_PATTERN.test(projectRef)
      && parsed.hostname.toLowerCase() !== `${projectRef}.supabase.co`) {
      errors.push("STAGING_SUPABASE_HOST_REF_MISMATCH");
    }
  }

  if (!clubName || clubName.length > 160 || !TEST_MARKER_PATTERN.test(clubName)) {
    errors.push("STAGING_TEST_CLUB_NAME_INVALID");
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 320 || !isClearlyTestEmail(email)) {
    errors.push("STAGING_TEST_MEMBER_EMAIL_INVALID");
  }
  if (password.length < 12 || password.length > 256 || /[\r\n]/u.test(password)) {
    errors.push("STAGING_TEST_MEMBER_PASSWORD_INVALID");
  }
  if (serviceRoleKey.length < 20 || /[\r\n]/u.test(serviceRoleKey)) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY_INVALID");
  }

  return {
    ok: errors.length === 0,
    enabled: true,
    credentialsConfigured: serviceRoleKey.length >= 20 && password.length >= 12,
    errors,
  };
}

function validateClub(club, expectedName, expectedCode) {
  if (!club) return;
  if (club.club_name !== expectedName || club.club_code !== expectedCode
    || club.club_status !== "active" || club.created_by_app_account_id !== null) {
    fail("CLUB_TENANT_IDENTITY_CONFLICT");
  }
}

function validateAuthUser(user, email) {
  if (!user) return;
  const metadataName = text(user.user_metadata?.display_name);
  if (normalizedEmail(user.email) !== email || !user.email_confirmed_at
    || metadataName !== DISPLAY_NAME || user.user_metadata?.staging_test_identity !== true) {
    fail("AUTH_USER_CONFLICT");
  }
}

function validatePerson(person, email) {
  if (!person) return;
  if (person.canonical_name !== DISPLAY_NAME || normalizedEmail(person.primary_email) !== email
    || text(person.primary_phone) || person.birth_date || person.avatar_url) {
    fail("PERSON_CONFLICT");
  }
}

/**
 * Idempotently create or confirm the minimum data needed by Hosted acceptance.
 * The adapter boundary keeps unit tests local and makes every external failure generic.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 * @param {StagingProvisioningAdapter} adapter
 */
export async function provisionStagingTestData(input, adapter) {
  const inspection = inspectStagingProvisioningInput(input);
  if (!inspection.ok || !inspection.enabled) fail("STAGING_PROVISIONING_INPUT_INVALID");

  const clubName = text(input.STAGING_EXPECTED_CLUB_NAME);
  const clubCode = deriveStagingClubCode(clubName);
  const email = normalizedEmail(input.STAGING_TEST_MEMBER_EMAIL);
  const password = String(input.STAGING_TEST_MEMBER_PASSWORD ?? "");

  const [clubByName, clubByCode, authUser, person] = await Promise.all([
    adapter.findClubsByName(clubName).then((rows) => unique(rows, "CLUB_NAME_CONFLICT")),
    adapter.findClubsByCode(clubCode).then((rows) => unique(rows, "CLUB_CODE_CONFLICT")),
    adapter.findAuthUsersByEmail(email).then((rows) => unique(rows, "AUTH_USER_CONFLICT")),
    adapter.findPeopleByEmail(email).then((rows) => unique(rows, "PERSON_CONFLICT")),
  ]);

  const existingClub = sameIdentity([clubByName, clubByCode]);
  validateClub(existingClub, clubName, clubCode);
  validateAuthUser(authUser, email);
  validatePerson(person, email);

  const [accountByAuth, accountByEmail, accountByPerson] = await Promise.all([
    authUser ? adapter.findAccountsByAuthUserId(authUser.id).then((rows) => unique(rows, "ACCOUNT_AUTH_CONFLICT")) : null,
    adapter.findAccountsByEmail(email).then((rows) => unique(rows, "ACCOUNT_EMAIL_CONFLICT")),
    person ? adapter.findAccountsByPersonId(person.id).then((rows) => unique(rows, "ACCOUNT_PERSON_CONFLICT")) : null,
  ]);
  const existingAccount = sameIdentity([accountByAuth, accountByEmail, accountByPerson]);

  if (existingAccount) {
    if (!authUser || !person || existingAccount.auth_user_id !== authUser.id
      || existingAccount.person_id !== person.id || existingAccount.login_email_normalized !== email
      || existingAccount.account_display_name !== DISPLAY_NAME || existingAccount.account_status !== "active") {
      fail("ACCOUNT_IDENTITY_CONFLICT");
    }
  }

  if (authUser && !(await adapter.verifyPasswordLogin(email, password))) {
    fail("AUTH_PASSWORD_CONFLICT");
  }

  if (existingAccount) {
    const [platformRoles, operatorPermissions, clubRoles] = await Promise.all([
      adapter.listActivePlatformRoles(existingAccount.id),
      adapter.listActiveOperatorPermissions(existingAccount.id),
      adapter.listActiveClubRoles(existingAccount.id),
    ]);
    if (platformRoles.length > 0 || operatorPermissions.length > 0
      || clubRoles.some((role) => role.club_id !== existingClub?.id || role.role_key !== "member")) {
      fail("TEST_ACCOUNT_PRIVILEGE_CONFLICT");
    }
  }

  if (person) {
    const memberships = await adapter.listMembershipsForPerson(person.id);
    if (memberships.length > 1
      || memberships.some((membership) => membership.club_id !== existingClub?.id)
      || memberships.some((membership) => membership.membership_status !== "active")) {
      fail("MEMBERSHIP_TENANT_CONFLICT");
    }
  }

  const created = { club: false, authUser: false, person: false, account: false, membership: false };
  const club = existingClub ?? await adapter.createClub({ clubCode, clubName });
  created.club = !existingClub;
  validateClub(club, clubName, clubCode);

  const finalAuthUser = authUser ?? await adapter.createAuthUser({ email, password, displayName: DISPLAY_NAME });
  created.authUser = !authUser;
  validateAuthUser(finalAuthUser, email);
  if (!(await adapter.verifyPasswordLogin(email, password))) fail("AUTH_PASSWORD_VERIFICATION_FAILED");

  const finalPerson = person ?? await adapter.createPerson({ email, displayName: DISPLAY_NAME });
  created.person = !person;
  validatePerson(finalPerson, email);

  const account = existingAccount ?? await adapter.createAccount({
    authUserId: finalAuthUser.id,
    personId: finalPerson.id,
    email,
    displayName: DISPLAY_NAME,
  });
  created.account = !existingAccount;
  if (account.auth_user_id !== finalAuthUser.id || account.person_id !== finalPerson.id
    || account.login_email_normalized !== email || account.account_status !== "active") {
    fail("ACCOUNT_CREATION_INVALID");
  }

  const memberships = await adapter.listMembershipsForPerson(finalPerson.id);
  let membership = memberships[0] ?? null;
  if (memberships.length > 1 || memberships.some((row) => row.club_id !== club.id)
    || memberships.some((row) => row.membership_status !== "active")) {
    fail("MEMBERSHIP_TENANT_CONFLICT");
  }
  if (!membership) {
    membership = await adapter.createMembership({ clubId: club.id, personId: finalPerson.id });
    created.membership = true;
  }
  if (membership.club_id !== club.id || membership.person_id !== finalPerson.id
    || membership.membership_status !== "active") {
    fail("MEMBERSHIP_CREATION_INVALID");
  }

  const [platformRoles, operatorPermissions, clubRoles] = await Promise.all([
    adapter.listActivePlatformRoles(account.id),
    adapter.listActiveOperatorPermissions(account.id),
    adapter.listActiveClubRoles(account.id),
  ]);
  if (platformRoles.length > 0 || operatorPermissions.length > 0
    || clubRoles.some((role) => role.club_id !== club.id || role.role_key !== "member")) {
    fail("TEST_ACCOUNT_PRIVILEGE_CONFLICT");
  }

  await adapter.ensureAuditEvent({ actionKey: "staging.test_club.provisioned", subjectType: "staging_test_data" });
  await adapter.ensureAuditEvent({ actionKey: "staging.test_auth_user.provisioned", subjectType: "staging_test_data" });
  await adapter.ensureAuditEvent({ actionKey: "staging.test_person.provisioned", subjectType: "staging_test_data" });
  await adapter.ensureAuditEvent({ actionKey: "staging.test_account.provisioned", subjectType: "staging_test_data" });
  await adapter.ensureAuditEvent({ actionKey: "staging.test_membership.provisioned", subjectType: "staging_test_data" });

  if (!(await adapter.verifyMemberAccess({ email, password, clubName }))) {
    fail("STAGING_MEMBER_ACCESS_VERIFICATION_FAILED");
  }

  return {
    ok: true,
    enabled: true,
    idempotent: !Object.values(created).some(Boolean),
    created,
  };
}

/** @returns {never} */
function databaseFailure() {
  fail("STAGING_PROVISIONING_DATABASE_FAILED");
}

function rows(result) {
  if (result.error) databaseFailure();
  return result.data ?? [];
}

/**
 * Build the production adapter. Raw Supabase errors are deliberately discarded.
 * @param {{url: string, serviceRoleKey: string}} config
 * @returns {StagingProvisioningAdapter}
 */
export function createSupabaseStagingProvisioningAdapter(config) {
  const admin = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return {
    async findClubsByName(clubName) {
      return rows(await admin.from("clubs")
        .select("id, club_code, club_name, club_status, created_by_app_account_id")
        .eq("club_name", clubName).limit(2));
    },
    async findClubsByCode(clubCode) {
      return rows(await admin.from("clubs")
        .select("id, club_code, club_name, club_status, created_by_app_account_id")
        .ilike("club_code", clubCode).limit(2));
    },
    async createClub({ clubCode, clubName }) {
      const result = await admin.from("clubs").insert({
        club_code: clubCode,
        club_name: clubName,
        club_status: "active",
        activated_at: new Date().toISOString(),
        created_by_app_account_id: null,
      }).select("id, club_code, club_name, club_status, created_by_app_account_id").single();
      if (result.error || !result.data) databaseFailure();
      return result.data;
    },
    async findAuthUsersByEmail(email) {
      const matches = [];
      for (let page = 1; page <= 100; page += 1) {
        const result = await admin.auth.admin.listUsers({ page, perPage: 100 });
        if (result.error) databaseFailure();
        matches.push(...result.data.users.filter((user) => normalizedEmail(user.email) === email));
        if (result.data.users.length < 100) return matches;
      }
      fail("AUTH_USER_SCAN_LIMIT_EXCEEDED");
    },
    async createAuthUser({ email, password, displayName }) {
      const result = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName, staging_test_identity: true },
      });
      if (result.error || !result.data.user) databaseFailure();
      return result.data.user;
    },
    async verifyPasswordLogin(email, password) {
      const client = createClient(config.url, config.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error || !result.data.user) return false;
      await client.auth.signOut({ scope: "local" });
      return true;
    },
    async findPeopleByEmail(email) {
      return rows(await admin.from("people")
        .select("id, canonical_name, primary_email, primary_phone, birth_date, avatar_url")
        .ilike("primary_email", email).limit(2));
    },
    async createPerson({ email, displayName }) {
      const result = await admin.from("people").insert({
        canonical_name: displayName,
        primary_email: email,
        primary_phone: null,
        birth_date: null,
        avatar_url: null,
        profile_completed_at: new Date().toISOString(),
      }).select("id, canonical_name, primary_email, primary_phone, birth_date, avatar_url").single();
      if (result.error || !result.data) databaseFailure();
      return result.data;
    },
    async findAccountsByAuthUserId(authUserId) {
      return rows(await admin.from("app_accounts")
        .select("id, auth_user_id, person_id, login_email_normalized, account_display_name, account_status")
        .eq("auth_user_id", authUserId).limit(2));
    },
    async findAccountsByEmail(email) {
      return rows(await admin.from("app_accounts")
        .select("id, auth_user_id, person_id, login_email_normalized, account_display_name, account_status")
        .eq("login_email_normalized", email).limit(2));
    },
    async findAccountsByPersonId(personId) {
      return rows(await admin.from("app_accounts")
        .select("id, auth_user_id, person_id, login_email_normalized, account_display_name, account_status")
        .eq("person_id", personId).limit(2));
    },
    async createAccount({ authUserId, personId, email, displayName }) {
      const result = await admin.from("app_accounts").insert({
        auth_user_id: authUserId,
        person_id: personId,
        login_email: email,
        account_display_name: displayName,
        account_status: "active",
      }).select("id, auth_user_id, person_id, login_email_normalized, account_display_name, account_status").single();
      if (result.error || !result.data) databaseFailure();
      return result.data;
    },
    async listMembershipsForPerson(personId) {
      return rows(await admin.from("club_memberships")
        .select("id, club_id, person_id, membership_status")
        .eq("person_id", personId));
    },
    async createMembership({ clubId, personId }) {
      const result = await admin.from("club_memberships").insert({
        club_id: clubId,
        person_id: personId,
        membership_status: "active",
        created_by_app_account_id: null,
      }).select("id, club_id, person_id, membership_status").single();
      if (result.error || !result.data) databaseFailure();
      return result.data;
    },
    async listActivePlatformRoles(accountId) {
      return rows(await admin.from("platform_roles").select("id, role_key")
        .eq("app_account_id", accountId).is("revoked_at", null));
    },
    async listActiveOperatorPermissions(accountId) {
      return rows(await admin.from("club_operator_permissions").select("id, club_id, operator_role_key")
        .eq("app_account_id", accountId).eq("assignment_status", "active"));
    },
    async listActiveClubRoles(accountId) {
      return rows(await admin.from("club_role_assignments").select("id, club_id, role_key")
        .eq("app_account_id", accountId).eq("assignment_status", "active"));
    },
    async ensureAuditEvent({ actionKey, subjectType }) {
      const existing = rows(await admin.from("audit_logs").select("id")
        .is("club_id", null).eq("action_key", actionKey)
        .eq("subject_type", subjectType).is("subject_id", null).limit(1));
      if (existing.length > 0) return;
      const result = await admin.from("audit_logs").insert({
        club_id: null,
        actor_app_account_id: null,
        action_key: actionKey,
        subject_type: subjectType,
        subject_id: null,
        metadata: { source: "staging_initial_provisioning" },
      });
      if (result.error) databaseFailure();
    },
    async verifyMemberAccess({ email, password, clubName }) {
      const client = createClient(config.url, config.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const signedIn = await client.auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.user) return false;
      try {
        const clubs = await client.rpc("list_my_directory_clubs");
        const center = await client.rpc("get_my_identity_center");
        if (clubs.error || center.error) return false;
        const profile = center.data?.profile;
        return Array.isArray(clubs.data)
          && clubs.data.some((club) => club.club_name === clubName)
          && text(profile?.display_name).length > 0
          && (text(profile?.email).length > 0 || text(profile?.phone).length > 0);
      } finally {
        await client.auth.signOut({ scope: "local" });
      }
    },
  };
}

export const STAGING_TEST_MEMBER_DISPLAY_NAME = DISPLAY_NAME;
