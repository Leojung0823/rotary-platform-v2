import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { isPublicHostname } from "./public-hostname.mjs";

const PROJECT_REF_PATTERN = /^[a-z0-9]{16,32}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const TEST_MARKER_PATTERN = /(?:staging|test|測試)/iu;
const RESERVED_TEST_DOMAIN_PATTERN = /(?:^|\.)(?:example\.(?:com|net|org)|test|invalid|example)$/iu;
const DISPLAY_NAMES = Object.freeze({
  suspended: "Staging Suspended Member",
  ended: "Staging Ended Member",
  outsider: "Staging Outsider Secretary",
});
const ROLE_SPECS = Object.freeze([
  {
    key: "suspended",
    emailEnv: "STAGING_TEST_SUSPENDED_EMAIL",
    passwordEnv: "STAGING_TEST_SUSPENDED_PASSWORD",
    membershipStatus: "suspended",
  },
  {
    key: "ended",
    emailEnv: "STAGING_TEST_ENDED_EMAIL",
    passwordEnv: "STAGING_TEST_ENDED_PASSWORD",
    membershipStatus: "ended",
  },
  {
    key: "outsider",
    emailEnv: "STAGING_TEST_OUTSIDER_SECRETARY_EMAIL",
    passwordEnv: "STAGING_TEST_OUTSIDER_SECRETARY_PASSWORD",
  },
]);

/** @typedef {{id: string, club_code: string, club_name: string, club_status: string, created_by_app_account_id: string | null}} ProvisionedClub */
/** @typedef {{id: string, email?: string | null, email_confirmed_at?: string | null, user_metadata?: Record<string, unknown>}} ProvisionedAuthUser */
/** @typedef {{id: string, canonical_name: string, primary_email: string | null, primary_phone: string | null, birth_date: string | null, avatar_url: string | null}} ProvisionedPerson */
/** @typedef {{id: string, auth_user_id: string, person_id: string, login_email_normalized: string, account_display_name: string, account_status: string}} ProvisionedAccount */
/** @typedef {{id: string, club_id: string, person_id: string, membership_status: string, joined_on?: string | null, ended_on?: string | null}} ProvisionedMembership */
/** @typedef {{id: string, club_id?: string | null, operator_role_key?: string, permission_level?: string}} ProvisionedOperatorPermission */
/** @typedef {{id: string, club_id?: string | null, role_key?: string}} ProvisionedRole */
/**
 * @typedef {object} StagingNegativeRoleProvisioningAdapter
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
 * @property {(input: {clubId: string, personId: string, membershipStatus: string, joinedOn: string, endedOn: string | null}) => Promise<ProvisionedMembership>} createMembership
 * @property {(input: {membershipId: string, membershipStatus: string, joinedOn: string, endedOn: string | null}) => Promise<ProvisionedMembership>} updateMembership
 * @property {(accountId: string) => Promise<ProvisionedRole[]>} listActivePlatformRoles
 * @property {(accountId: string) => Promise<ProvisionedOperatorPermission[]>} listActiveOperatorPermissions
 * @property {(accountId: string) => Promise<ProvisionedRole[]>} listActiveClubRoles
 * @property {(input: {clubId: string, accountId: string}) => Promise<ProvisionedOperatorPermission>} createOperatorPermission
 * @property {(input: {permissionId: string}) => Promise<ProvisionedOperatorPermission>} normalizeOperatorPermission
 * @property {(input: {actionKey: string, subjectType: string}) => Promise<void>} ensureAuditEvent
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
  error.name = "StagingNegativeRoleProvisioningError";
  throw error;
}

function unique(rows, code) {
  if (!Array.isArray(rows) || rows.length > 1) fail(code);
  return rows[0] ?? null;
}

function sameIdentity(rows) {
  const present = rows.filter(Boolean);
  if (present.length <= 1) return present[0] ?? null;
  if (present.some((row) => row.id !== present[0].id)) fail("IDENTITY_CONFLICT");
  return present[0];
}

function isClearlyTestEmail(email) {
  const [localPart, domain] = email.split("@");
  return TEST_MARKER_PATTERN.test(localPart ?? "")
    && RESERVED_TEST_DOMAIN_PATTERN.test(domain ?? "");
}

function digestFor(value) {
  return createHash("sha256")
    .update(`rotary-platform-v2:staging-negative-role:${text(value).normalize("NFKC").toLowerCase()}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
}

export function deriveStagingNegativeRoleClubCode(targetClubName) {
  return `STG-NR-${digestFor(targetClubName)}`;
}

export function deriveStagingNegativeRoleClubName(targetClubName) {
  return `Rotary Staging Negative Role Club ${digestFor(targetClubName).slice(0, 8)}`;
}

function validateHttpsOrigin(errors, rawValue) {
  if (!rawValue) {
    errors.push("STAGING_BASE_URL_REQUIRED");
    return null;
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    errors.push("STAGING_BASE_URL_INVALID");
    return null;
  }

  if (parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash) {
    errors.push("STAGING_BASE_URL_HTTPS_ORIGIN_REQUIRED");
  }
  if (!isPublicHostname(parsed.hostname)) errors.push("STAGING_BASE_URL_PUBLIC_HOST_REQUIRED");
  return parsed;
}

function inspectRoleCredentials(errors, input, spec) {
  const email = normalizedEmail(input[spec.emailEnv]);
  const password = String(input[spec.passwordEnv] ?? "");
  if (!EMAIL_PATTERN.test(email) || email.length > 320 || !isClearlyTestEmail(email)) {
    errors.push(`${spec.emailEnv}_INVALID`);
  }
  if (password.length < 12 || password.length > 256 || /[\r\n]/u.test(password)) {
    errors.push(`${spec.passwordEnv}_INVALID`);
  }
  return { email, password };
}

/**
 * Validate a manual, staging-only negative-role provisioning run.
 * Credential values are inspected but never returned.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function inspectStagingNegativeRoleProvisioningInput(input = process.env) {
  const errors = [];
  const rawEnabled = text(input.STAGING_PROVISION_NEGATIVE_ROLES).toLowerCase();
  const enabled = rawEnabled === "true";

  if (!new Set(["true", "false"]).has(rawEnabled)) errors.push("STAGING_PROVISION_NEGATIVE_ROLES_INVALID");
  if (!enabled) {
    return {
      ok: errors.length === 0,
      enabled: false,
      credentialsConfigured: false,
      errors,
    };
  }

  const siteUrl = validateHttpsOrigin(errors, text(input.STAGING_BASE_URL));
  const projectRef = text(input.SUPABASE_PROJECT_REF);
  const rawSupabaseUrl = text(input.NEXT_PUBLIC_SUPABASE_URL ?? input.SUPABASE_URL);
  const targetClubName = text(input.STAGING_EXPECTED_CLUB_NAME);
  const serviceRoleKey = String(input.SUPABASE_SERVICE_ROLE_KEY ?? "");
  const credentials = ROLE_SPECS.map((spec) => inspectRoleCredentials(errors, input, spec));

  if (text(input.STAGING_NEGATIVE_ROLE_PROVISIONING_CONFIRMATION) !== "PROVISION-STAGING-NEGATIVE-ROLES") {
    errors.push("STAGING_NEGATIVE_ROLE_PROVISIONING_CONFIRMATION_MISMATCH");
  }
  if (text(input.APP_ENV) !== "staging") errors.push("STAGING_APP_ENV_REQUIRED");
  if (text(input.TRUSTED_ADMIN_ENVIRONMENT) !== "staging") errors.push("STAGING_TRUSTED_BOUNDARY_REQUIRED");
  if (text(input.STAGING_BACKUP_CONFIRMATION) !== "BACKUP-READY") {
    errors.push("STAGING_BACKUP_CONFIRMATION_MISMATCH");
  }
  if (text(input.STAGING_PROJECT_IDENTITY_CONFIRMATION) !== "STAGING-PROJECT-VERIFIED") {
    errors.push("STAGING_PROJECT_IDENTITY_CONFIRMATION_MISMATCH");
  }
  if (!PROJECT_REF_PATTERN.test(projectRef)) errors.push("SUPABASE_PROJECT_REF_INVALID");

  let supabaseUrl;
  try {
    supabaseUrl = new URL(rawSupabaseUrl);
  } catch {
    errors.push("STAGING_SUPABASE_URL_INVALID");
  }
  if (supabaseUrl) {
    if (supabaseUrl.protocol !== "https:"
      || supabaseUrl.username
      || supabaseUrl.password
      || supabaseUrl.pathname !== "/"
      || supabaseUrl.search
      || supabaseUrl.hash
      || !isPublicHostname(supabaseUrl.hostname)) {
      errors.push("STAGING_SUPABASE_HTTPS_ORIGIN_REQUIRED");
    }
    if (PROJECT_REF_PATTERN.test(projectRef)
      && supabaseUrl.hostname.toLowerCase() !== `${projectRef}.supabase.co`) {
      errors.push("STAGING_SUPABASE_HOST_REF_MISMATCH");
    }
  }

  if (!targetClubName || targetClubName.length > 160 || !TEST_MARKER_PATTERN.test(targetClubName)) {
    errors.push("STAGING_EXPECTED_CLUB_NAME_INVALID");
  }
  if (serviceRoleKey.length < 20 || /[\r\n]/u.test(serviceRoleKey)) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY_INVALID");
  }

  const emails = credentials.map(({ email }) => email);
  if (new Set(emails).size !== emails.length) errors.push("STAGING_NEGATIVE_ROLE_IDENTITIES_MUST_DIFFER");

  return {
    ok: errors.length === 0,
    enabled: true,
    siteOrigin: siteUrl?.origin ?? null,
    credentialsConfigured: credentials.every(({ email, password }) => EMAIL_PATTERN.test(email) && password.length >= 12),
    errors,
  };
}

function validateTestClub(club, expectedName, expectedCode) {
  if (!club || club.club_name !== expectedName || club.club_code !== expectedCode
    || club.club_status !== "active" || club.created_by_app_account_id !== null) {
    fail("NEGATIVE_ROLE_CLUB_IDENTITY_CONFLICT");
  }
}

function validateTargetClub(club, expectedName) {
  if (!club || club.club_name !== expectedName || club.club_status !== "active") {
    fail("TARGET_STAGING_CLUB_NOT_ACTIVE");
  }
}

function validateAuthUser(user, email, displayName) {
  if (!user) return;
  if (normalizedEmail(user.email) !== email
    || !user.email_confirmed_at
    || text(user.user_metadata?.display_name) !== displayName
    || user.user_metadata?.staging_test_identity !== true) {
    fail("NEGATIVE_ROLE_AUTH_USER_CONFLICT");
  }
}

function validatePerson(person, email, displayName) {
  if (!person) return;
  if (person.canonical_name !== displayName
    || normalizedEmail(person.primary_email) !== email
    || text(person.primary_phone)
    || person.birth_date
    || person.avatar_url) {
    fail("NEGATIVE_ROLE_PERSON_CONFLICT");
  }
}

async function ensureIdentity(spec, input, adapter) {
  const email = normalizedEmail(input[spec.emailEnv]);
  const password = String(input[spec.passwordEnv] ?? "");
  const displayName = DISPLAY_NAMES[spec.key];
  const [authUserByEmail, personByEmail] = await Promise.all([
    adapter.findAuthUsersByEmail(email).then((rows) => unique(rows, "NEGATIVE_ROLE_AUTH_USER_DUPLICATE")),
    adapter.findPeopleByEmail(email).then((rows) => unique(rows, "NEGATIVE_ROLE_PERSON_DUPLICATE")),
  ]);

  validateAuthUser(authUserByEmail, email, displayName);
  validatePerson(personByEmail, email, displayName);

  const [accountByAuth, accountByEmail, accountByPerson] = await Promise.all([
    authUserByEmail
      ? adapter.findAccountsByAuthUserId(authUserByEmail.id).then((rows) => unique(rows, "NEGATIVE_ROLE_ACCOUNT_AUTH_DUPLICATE"))
      : null,
    adapter.findAccountsByEmail(email).then((rows) => unique(rows, "NEGATIVE_ROLE_ACCOUNT_EMAIL_DUPLICATE")),
    personByEmail
      ? adapter.findAccountsByPersonId(personByEmail.id).then((rows) => unique(rows, "NEGATIVE_ROLE_ACCOUNT_PERSON_DUPLICATE"))
      : null,
  ]);
  const existingAccount = sameIdentity([accountByAuth, accountByEmail, accountByPerson]);

  if (existingAccount && (!authUserByEmail || !personByEmail
    || existingAccount.auth_user_id !== authUserByEmail.id
    || existingAccount.person_id !== personByEmail.id
    || existingAccount.login_email_normalized !== email
    || existingAccount.account_display_name !== displayName
    || existingAccount.account_status !== "active")) {
    fail("NEGATIVE_ROLE_ACCOUNT_CONFLICT");
  }
  if (authUserByEmail && !(await adapter.verifyPasswordLogin(email, password))) {
    fail("NEGATIVE_ROLE_AUTH_PASSWORD_CONFLICT");
  }

  const created = { authUser: false, person: false, account: false };
  const authUser = authUserByEmail ?? await adapter.createAuthUser({ email, password, displayName });
  created.authUser = !authUserByEmail;
  validateAuthUser(authUser, email, displayName);
  if (!(await adapter.verifyPasswordLogin(email, password))) fail("NEGATIVE_ROLE_AUTH_PASSWORD_VERIFICATION_FAILED");

  const person = personByEmail ?? await adapter.createPerson({ email, displayName });
  created.person = !personByEmail;
  validatePerson(person, email, displayName);

  const account = existingAccount ?? await adapter.createAccount({
    authUserId: authUser.id,
    personId: person.id,
    email,
    displayName,
  });
  created.account = !existingAccount;
  if (account.auth_user_id !== authUser.id || account.person_id !== person.id
    || account.login_email_normalized !== email
    || account.account_display_name !== displayName
    || account.account_status !== "active") {
    fail("NEGATIVE_ROLE_ACCOUNT_CREATION_INVALID");
  }

  const [platformRoles, clubRoles] = await Promise.all([
    adapter.listActivePlatformRoles(account.id),
    adapter.listActiveClubRoles(account.id),
  ]);
  if (platformRoles.length > 0 || clubRoles.length > 0) fail("NEGATIVE_ROLE_PRIVILEGE_CONFLICT");

  return { authUser, person, account, email, password, created };
}

async function ensureMembership(identity, targetClub, membershipStatus, adapter) {
  const memberships = await adapter.listMembershipsForPerson(identity.person.id);
  if (memberships.length > 1 || memberships.some((row) => row.club_id !== targetClub.id)) {
    fail("NEGATIVE_ROLE_MEMBERSHIP_TENANT_CONFLICT");
  }

  const joinedOn = "2020-01-01";
  const endedOn = membershipStatus === "ended" ? "2020-12-31" : null;
  let membership = memberships[0] ?? null;
  const created = !membership;
  let changed = false;
  if (!membership) {
    membership = await adapter.createMembership({
      clubId: targetClub.id,
      personId: identity.person.id,
      membershipStatus,
      joinedOn,
      endedOn,
    });
    changed = true;
  } else if (membership.membership_status !== membershipStatus
    || membership.joined_on !== joinedOn
    || (membership.ended_on ?? null) !== endedOn) {
    membership = await adapter.updateMembership({
      membershipId: membership.id,
      membershipStatus,
      joinedOn,
      endedOn,
    });
    changed = true;
  }

  if (membership.club_id !== targetClub.id
    || membership.person_id !== identity.person.id
    || membership.membership_status !== membershipStatus) {
    fail("NEGATIVE_ROLE_MEMBERSHIP_INVALID");
  }
  return { membership, created, changed };
}

async function ensureNoActiveOperatorPermission(account, adapter) {
  const permissions = await adapter.listActiveOperatorPermissions(account.id);
  if (permissions.length > 0) fail("NEGATIVE_ROLE_OPERATOR_PRIVILEGE_CONFLICT");
}

async function ensureOutsiderPermission(identity, negativeClub, adapter) {
  const memberships = await adapter.listMembershipsForPerson(identity.person.id);
  if (memberships.length > 0) fail("OUTSIDER_SECRETARY_MEMBERSHIP_CONFLICT");

  const permissions = await adapter.listActiveOperatorPermissions(identity.account.id);
  if (permissions.length > 1 || permissions.some((row) => row.club_id !== negativeClub.id
    || row.operator_role_key !== "executive_secretary")) {
    fail("OUTSIDER_SECRETARY_OPERATOR_TENANT_CONFLICT");
  }

  let permission = permissions[0] ?? null;
  const created = !permission;
  let changed = false;
  if (!permission) {
    permission = await adapter.createOperatorPermission({ clubId: negativeClub.id, accountId: identity.account.id });
    changed = true;
  } else if (permission.permission_level !== "club_manager") {
    permission = await adapter.normalizeOperatorPermission({ permissionId: permission.id });
    changed = true;
  }

  if (permission.club_id !== negativeClub.id
    || permission.operator_role_key !== "executive_secretary"
    || permission.permission_level !== "club_manager") {
    fail("OUTSIDER_SECRETARY_OPERATOR_INVALID");
  }
  return { permission, created, changed };
}

/**
 * Provision three reserved staging identities used only for hosted negative
 * authorization acceptance. This never changes an account outside the
 * reserved test identities and never returns credential or tenant values.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 * @param {StagingNegativeRoleProvisioningAdapter} adapter
 */
export async function provisionStagingNegativeRoleIdentities(input, adapter) {
  const inspection = inspectStagingNegativeRoleProvisioningInput(input);
  if (!inspection.ok || !inspection.enabled) fail("STAGING_NEGATIVE_ROLE_PROVISIONING_INPUT_INVALID");

  const targetClubName = text(input.STAGING_EXPECTED_CLUB_NAME);
  const negativeClubName = deriveStagingNegativeRoleClubName(targetClubName);
  const negativeClubCode = deriveStagingNegativeRoleClubCode(targetClubName);
  const targetClub = unique(await adapter.findClubsByName(targetClubName), "TARGET_STAGING_CLUB_DUPLICATE");
  validateTargetClub(targetClub, targetClubName);

  const [clubByName, clubByCode] = await Promise.all([
    adapter.findClubsByName(negativeClubName).then((rows) => unique(rows, "NEGATIVE_ROLE_CLUB_NAME_DUPLICATE")),
    adapter.findClubsByCode(negativeClubCode).then((rows) => unique(rows, "NEGATIVE_ROLE_CLUB_CODE_DUPLICATE")),
  ]);
  const existingNegativeClub = sameIdentity([clubByName, clubByCode]);
  if (existingNegativeClub) validateTestClub(existingNegativeClub, negativeClubName, negativeClubCode);
  const negativeClub = existingNegativeClub ?? await adapter.createClub({
    clubCode: negativeClubCode,
    clubName: negativeClubName,
  });
  validateTestClub(negativeClub, negativeClubName, negativeClubCode);

  const identities = {};
  const changes = { club: !existingNegativeClub, suspended: false, ended: false, outsider: false };

  for (const spec of ROLE_SPECS) {
    const identity = await ensureIdentity(spec, input, adapter);
    identities[spec.key] = identity;
    if (spec.membershipStatus) {
      const membership = await ensureMembership(identity, targetClub, spec.membershipStatus, adapter);
      await ensureNoActiveOperatorPermission(identity.account, adapter);
      changes[spec.key] = membership.changed;
    } else {
      const permission = await ensureOutsiderPermission(identity, negativeClub, adapter);
      changes[spec.key] = permission.changed;
    }
  }

  await Promise.all(ROLE_SPECS.map(async (spec) => {
    await adapter.ensureAuditEvent({
      actionKey: `staging.negative_role.${spec.key}.provisioned`,
      subjectType: "staging_negative_role_identity",
    });
  }));
  await adapter.ensureAuditEvent({
    actionKey: "staging.negative_role_club.provisioned",
    subjectType: "staging_negative_role_fixture",
  });

  await Promise.all(ROLE_SPECS.map((spec) => {
    const identity = identities[spec.key];
    return adapter.verifyPasswordLogin(identity.email, identity.password)
      .then((verified) => {
        if (!verified) fail("NEGATIVE_ROLE_AUTH_LOGIN_VERIFICATION_FAILED");
      });
  }));

  return {
    ok: true,
    enabled: true,
    idempotent: !Object.values(changes).some(Boolean),
    created: {
      negativeClub: changes.club,
      suspended: changes.suspended,
      ended: changes.ended,
      outsiderSecretary: changes.outsider,
    },
  };
}

/** @returns {never} */
function databaseFailure() {
  fail("STAGING_NEGATIVE_ROLE_DATABASE_FAILED");
}

function rows(result) {
  if (result.error) databaseFailure();
  return result.data ?? [];
}

/**
 * @param {{url: string, serviceRoleKey: string}} config
 * @returns {StagingNegativeRoleProvisioningAdapter}
 */
export function createSupabaseStagingNegativeRoleProvisioningAdapter(config) {
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
      fail("NEGATIVE_ROLE_AUTH_USER_SCAN_LIMIT_EXCEEDED");
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
        .select("id, club_id, person_id, membership_status, joined_on, ended_on")
        .eq("person_id", personId));
    },
    async createMembership({ clubId, personId, membershipStatus, joinedOn, endedOn }) {
      const result = await admin.from("club_memberships").insert({
        club_id: clubId,
        person_id: personId,
        membership_status: membershipStatus,
        joined_on: joinedOn,
        ended_on: endedOn,
        created_by_app_account_id: null,
      }).select("id, club_id, person_id, membership_status, joined_on, ended_on").single();
      if (result.error || !result.data) databaseFailure();
      return result.data;
    },
    async updateMembership({ membershipId, membershipStatus, joinedOn, endedOn }) {
      const result = await admin.from("club_memberships").update({
        membership_status: membershipStatus,
        joined_on: joinedOn,
        ended_on: endedOn,
      }).eq("id", membershipId)
        .select("id, club_id, person_id, membership_status, joined_on, ended_on").single();
      if (result.error || !result.data) databaseFailure();
      return result.data;
    },
    async listActivePlatformRoles(accountId) {
      return rows(await admin.from("platform_roles").select("id, role_key")
        .eq("app_account_id", accountId).is("revoked_at", null));
    },
    async listActiveOperatorPermissions(accountId) {
      return rows(await admin.from("club_operator_permissions")
        .select("id, club_id, operator_role_key, permission_level")
        .eq("app_account_id", accountId).eq("assignment_status", "active"));
    },
    async listActiveClubRoles(accountId) {
      return rows(await admin.from("club_role_assignments").select("id, club_id, role_key")
        .eq("app_account_id", accountId).eq("assignment_status", "active"));
    },
    async createOperatorPermission({ clubId, accountId }) {
      const result = await admin.from("club_operator_permissions").insert({
        club_id: clubId,
        app_account_id: accountId,
        operator_role_key: "executive_secretary",
        permission_level: "club_manager",
        assignment_status: "active",
        granted_by_app_account_id: null,
      }).select("id, club_id, operator_role_key, permission_level").single();
      if (result.error || !result.data) databaseFailure();
      return result.data;
    },
    async normalizeOperatorPermission({ permissionId }) {
      const result = await admin.from("club_operator_permissions").update({
        operator_role_key: "executive_secretary",
        permission_level: "club_manager",
        assignment_status: "active",
        ends_at: null,
        revoked_at: null,
        revoked_by_app_account_id: null,
        revoke_reason: null,
      }).eq("id", permissionId)
        .select("id, club_id, operator_role_key, permission_level").single();
      if (result.error || !result.data) databaseFailure();
      return result.data;
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
        metadata: { source: "staging_negative_role_provisioning" },
      });
      if (result.error) databaseFailure();
    },
  };
}

export const STAGING_NEGATIVE_ROLE_DISPLAY_NAMES = DISPLAY_NAMES;
