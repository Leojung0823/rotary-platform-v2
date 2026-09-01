import { createClient } from "@supabase/supabase-js";
import { inspectBootstrapTarget } from "../src/lib/bootstrap-target.mjs";

const scenarios = {
  disabled: { roleShells: false, memberHome: false, checkinQr: false, gpsCheckin: false, attendanceUi: false, messageCenter: false, birthdayV2: false, birthdayCollection: false, archiveHandover: false },
  "member-home-disabled": { roleShells: true, memberHome: false, checkinQr: false, gpsCheckin: false, attendanceUi: false, messageCenter: false, birthdayV2: false, birthdayCollection: false, archiveHandover: false },
  "checkin-disabled": { roleShells: true, memberHome: true, checkinQr: false, gpsCheckin: false, attendanceUi: false, messageCenter: true, birthdayV2: false, birthdayCollection: false, archiveHandover: false },
  enabled: { roleShells: true, memberHome: true, checkinQr: true, gpsCheckin: true, attendanceUi: true, messageCenter: true, birthdayV2: true, birthdayCollection: true, archiveHandover: true },
};
const scenario = scenarios[process.argv[2]] ?? null;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;

function fail(message) { throw new Error(`Role-shell fixture configuration failed: ${message}`); }
if (scenario === null) fail("expected disabled, member-home-disabled, checkin-disabled, or enabled argument");
if (!url || !publishableKey || !email || !password) fail("required environment variables are missing");

const target = inspectBootstrapTarget(process.env);
if (!target.ok || target.target !== "local") fail("local Supabase is required");

const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = await client.auth.signInWithPassword({ email, password });
if (signIn.error) fail("local superadmin sign-in did not succeed");

for (const [featureKey, enabled] of [
  ["role_context_v2", scenario.roleShells],
  ["role_shells_v2", scenario.roleShells],
  ["member_home_v2", scenario.memberHome],
  ["checkin_qr_v2", scenario.checkinQr],
  ["checkin_gps_v2", scenario.gpsCheckin],
  ["attendance_ui_v2", scenario.attendanceUi],
  // The message centre ships disabled and stays disabled until a record says
  // otherwise, so the browser tests have to turn it on explicitly.
  ["announcements_v09", scenario.messageCenter],
  ["birthday_wishes_v2", scenario.birthdayV2],
  ["birthday_wishes_collection_v1", scenario.birthdayCollection],
  ["archive_handover_v1", scenario.archiveHandover],
]) {
  const { error } = await client.rpc("set_platform_feature_flag", {
    p_feature_key: featureKey,
    p_enabled: enabled,
    p_enabled_environments: ["local"],
    p_rollout_percentage: 100,
  });
  if (error) fail("protected feature-flag RPC did not succeed");
}

console.log(`Local role-shell/member-home flags use the ${process.argv[2]} scenario through the protected RPC.`);
