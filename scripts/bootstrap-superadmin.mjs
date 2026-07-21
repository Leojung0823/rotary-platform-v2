import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;
const displayName = process.env.BOOTSTRAP_SUPERADMIN_NAME?.trim();

function fail(message) { console.error(`Bootstrap aborted: ${message}`); process.exit(1); }
if (!url || !serviceRoleKey || !email || !password || !displayName) fail("required environment variables are missing");
let parsed;
try { parsed = new URL(url); } catch { fail("Supabase URL is invalid"); }
if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) && process.env.ALLOW_NONLOCAL_SUPABASE_BOOTSTRAP !== "I_UNDERSTAND_THE_RISK") fail("the Supabase URL is not local");
if (password.length < 12) fail("the bootstrap password must contain at least 12 characters");

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
let authUser;
for (let page = 1; !authUser; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (error) fail("could not inspect local Auth users");
  authUser = data.users.find((user) => user.email?.toLowerCase() === email);
  if (data.users.length < 100) break;
}
if (!authUser) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
  if (error || !data.user) fail("could not create the local Auth user");
  authUser = data.user;
}

let { data: account, error: accountReadError } = await admin.from("app_accounts").select("id, person_id, auth_user_id").eq("auth_user_id", authUser.id).maybeSingle();
if (accountReadError) fail("could not inspect the application account");
if (!account) {
  const { data: emailAccount } = await admin.from("app_accounts").select("id, person_id, auth_user_id").eq("login_email_normalized", email).maybeSingle();
  if (emailAccount && emailAccount.auth_user_id !== authUser.id) fail("the email is linked to a different Auth user");
  let { data: person } = await admin.from("people").select("id").ilike("primary_email", email).maybeSingle();
  if (!person) {
    const result = await admin.from("people").insert({ canonical_name: displayName, primary_email: email }).select("id").single();
    if (result.error) fail("could not create the person row"); person = result.data;
  }
  const result = await admin.from("app_accounts").insert({ auth_user_id: authUser.id, person_id: person.id, login_email: email, account_display_name: displayName }).select("id, person_id, auth_user_id").single();
  if (result.error) fail("could not create the application account"); account = result.data;
}
const { data: role, error: roleReadError } = await admin.from("platform_roles").select("id").eq("app_account_id", account.id).eq("role_key", "superadmin").is("revoked_at", null).maybeSingle();
if (roleReadError) fail("could not inspect platform roles");
if (!role) {
  const { error } = await admin.from("platform_roles").insert({ app_account_id: account.id, role_key: "superadmin" });
  if (error) fail("could not grant the superadmin role");
}
console.log(`Local superadmin is ready for ${email}. No credential values were printed.`);
