import { createClient } from "@supabase/supabase-js";
import { inspectBootstrapTarget } from "../src/lib/bootstrap-target.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.E2E_ROLE_PASSWORD;

function fail(message) { throw new Error(`Role-shell browser fixture bootstrap failed: ${message}`); }
if (!url || !serviceRoleKey || !adminEmail || !password) fail("required environment variables are missing");
if (password.length < 12) fail("E2E_ROLE_PASSWORD must contain at least 12 characters");

const target = inspectBootstrapTarget(process.env);
if (!target.ok || target.target !== "local") fail("local Supabase is required");

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function authUserFor(email, displayName) {
  let found = null;
  for (let page = 1; !found; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) fail("could not inspect local Auth users");
    found = data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
    if (data.users.length < 100) break;
  }
  if (!found) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error || !data.user) fail("could not create local fixture Auth user");
    return data.user;
  }
  const { data, error } = await admin.auth.admin.updateUserById(found.id, {
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error || !data.user) fail("could not refresh local fixture Auth user");
  return data.user;
}

async function accountFor(email, displayName) {
  const user = await authUserFor(email, displayName);
  const existing = await admin.from("app_accounts")
    .select("id, person_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existing.error) fail("could not inspect local fixture account");
  if (existing.data) return { ...existing.data, authUserId: user.id };

  const person = await admin.from("people")
    .insert({ canonical_name: displayName, primary_email: email })
    .select("id")
    .single();
  if (person.error || !person.data) fail("could not create local fixture person");
  const account = await admin.from("app_accounts")
    .insert({
      auth_user_id: user.id,
      person_id: person.data.id,
      login_email: email,
      account_display_name: displayName,
      account_status: "active",
    })
    .select("id, person_id")
    .single();
  if (account.error || !account.data) fail("could not create local fixture account");
  return { ...account.data, authUserId: user.id };
}

async function clubFor(id, code, name, createdBy) {
  const existing = await admin.from("clubs").select("id").eq("club_code", code).maybeSingle();
  if (existing.error) fail("could not inspect local fixture club");
  if (existing.data) return existing.data;
  const club = await admin.from("clubs")
    .insert({
      id,
      club_code: code,
      club_name: name,
      club_status: "active",
      activated_at: new Date().toISOString(),
      created_by_app_account_id: createdBy,
    })
    .select("id")
    .single();
  if (club.error || !club.data) fail("could not create local fixture club");
  return club.data;
}

async function addMembership({ clubId, account, status = "active", createdBy }) {
  const existing = await admin.from("club_memberships")
    .select("id")
    .eq("club_id", clubId)
    .eq("person_id", account.person_id)
    .maybeSingle();
  if (existing.error) fail("could not inspect local fixture membership");
  if (existing.data) {
    const update = await admin.from("club_memberships").update({ membership_status: status, ended_on: null }).eq("id", existing.data.id);
    if (update.error) fail("could not update local fixture membership");
    return;
  }
  const insert = await admin.from("club_memberships").insert({
    club_id: clubId,
    person_id: account.person_id,
    membership_status: status,
    created_by_app_account_id: createdBy,
  });
  if (insert.error) fail("could not create local fixture membership");
}

async function addOperator({ clubId, account, status = "active", createdBy }) {
  const existing = await admin.from("club_operator_permissions")
    .select("id")
    .eq("club_id", clubId)
    .eq("app_account_id", account.id)
    .maybeSingle();
  if (existing.error) fail("could not inspect local fixture operator");
  const values = status === "active"
    ? { assignment_status: "active", ends_at: null, revoked_at: null, revoked_by_app_account_id: null, revoke_reason: null }
    : { assignment_status: "revoked", revoked_at: new Date().toISOString(), revoked_by_app_account_id: createdBy, revoke_reason: "local_browser_fixture" };
  if (existing.data) {
    const update = await admin.from("club_operator_permissions").update(values).eq("id", existing.data.id);
    if (update.error) fail("could not update local fixture operator");
    return;
  }
  const insert = await admin.from("club_operator_permissions").insert({
    club_id: clubId,
    app_account_id: account.id,
    permission_level: "club_manager",
    granted_by_app_account_id: createdBy,
    ...values,
  });
  if (insert.error) fail("could not create local fixture operator");
}

async function addPlatformRole({ account, createdBy }) {
  const existing = await admin.from("platform_roles")
    .select("id")
    .eq("app_account_id", account.id)
    .eq("role_key", "platform_admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (existing.error) fail("could not inspect local fixture platform role");
  if (existing.data) return;
  const insert = await admin.from("platform_roles").insert({
    app_account_id: account.id,
    role_key: "platform_admin",
    granted_by_app_account_id: createdBy,
  });
  if (insert.error) fail("could not create local fixture platform role");
}

async function addClubManagementRole({ clubId, account, createdBy }) {
  const existing = await admin.from("club_role_assignments")
    .select("id")
    .eq("club_id", clubId)
    .eq("app_account_id", account.id)
    .eq("role_key", "president")
    .eq("assignment_status", "active")
    .maybeSingle();
  if (existing.error) fail("could not inspect local fixture club role");
  if (existing.data) return;
  const insert = await admin.from("club_role_assignments").insert({
    club_id: clubId,
    app_account_id: account.id,
    role_key: "president",
    granted_by_app_account_id: createdBy,
  });
  if (insert.error) fail("could not create local fixture club role");
}

const bootstrapAccount = await admin.from("app_accounts").select("id").eq("login_email_normalized", adminEmail).maybeSingle();
if (bootstrapAccount.error || !bootstrapAccount.data) fail("local superadmin account is missing");
const createdBy = bootstrapAccount.data.id;

const [memberClub, secondMemberClub, managedClub] = await Promise.all([
  clubFor("a1000000-0000-4000-8000-000000000001", "E2E-SHELL-MEMBER", "本機 Shell 社員社", createdBy),
  clubFor("a1000000-0000-4000-8000-000000000002", "E2E-SHELL-SECOND", "本機 Shell 第二社", createdBy),
  clubFor("a1000000-0000-4000-8000-000000000003", "E2E-SHELL-MANAGED", "本機 Shell 管理社", createdBy),
]);

const fixtures = Object.fromEntries(await Promise.all([
  ["ordinary", "e2e-shell-ordinary@example.test", "一般社員"],
  ["multi", "e2e-shell-multi@example.test", "多社社員"],
  ["memberManager", "e2e-shell-member-manager@example.test", "社員管理者"],
  ["management", "e2e-shell-management@example.test", "純社務管理者"],
  ["platform", "e2e-shell-platform@example.test", "純平台管理者"],
  ["platformMember", "e2e-shell-platform-member@example.test", "平台社員"],
  ["allModes", "e2e-shell-all-modes@example.test", "三模式使用者"],
  ["revoked", "e2e-shell-revoked@example.test", "已撤銷管理者"],
  ["suspended", "e2e-shell-suspended@example.test", "停權社員"],
].map(async ([key, email, displayName]) => [key, await accountFor(email, displayName)])));

await addMembership({ clubId: memberClub.id, account: fixtures.ordinary, createdBy });
await addMembership({ clubId: memberClub.id, account: fixtures.multi, createdBy });
await addMembership({ clubId: secondMemberClub.id, account: fixtures.multi, createdBy });
await addMembership({ clubId: memberClub.id, account: fixtures.memberManager, createdBy });
await addClubManagementRole({ clubId: memberClub.id, account: fixtures.memberManager, createdBy });
await addOperator({ clubId: managedClub.id, account: fixtures.management, createdBy });
await addPlatformRole({ account: fixtures.platform, createdBy });
await addMembership({ clubId: memberClub.id, account: fixtures.platformMember, createdBy });
await addPlatformRole({ account: fixtures.platformMember, createdBy });
await addMembership({ clubId: memberClub.id, account: fixtures.allModes, createdBy });
await addClubManagementRole({ clubId: memberClub.id, account: fixtures.allModes, createdBy });
await addPlatformRole({ account: fixtures.allModes, createdBy });
await addOperator({ clubId: managedClub.id, account: fixtures.revoked, status: "revoked", createdBy });
await addMembership({ clubId: memberClub.id, account: fixtures.suspended, status: "suspended", createdBy });

console.log("Local role-shell browser roles A-G plus revoked and suspended access fixtures are ready. No credentials were printed.");
