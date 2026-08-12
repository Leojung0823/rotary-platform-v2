import { createClient } from "@supabase/supabase-js";
import { inspectBootstrapTarget } from "../src/lib/bootstrap-target.mjs";

const scenarios = {
  disabled: { roleShells: false, memberHome: false, checkinQr: false },
  "member-home-disabled": { roleShells: true, memberHome: false, checkinQr: false },
  "checkin-disabled": { roleShells: true, memberHome: true, checkinQr: false },
  enabled: { roleShells: true, memberHome: true, checkinQr: true },
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
