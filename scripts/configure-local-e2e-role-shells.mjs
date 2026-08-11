import { createClient } from "@supabase/supabase-js";
import { inspectBootstrapTarget } from "../src/lib/bootstrap-target.mjs";

const enabled = process.argv[2] === "enabled"
  ? true
  : process.argv[2] === "disabled"
    ? false
    : null;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;

function fail(message) { throw new Error(`Role-shell fixture configuration failed: ${message}`); }
if (enabled === null) fail("expected enabled or disabled argument");
if (!url || !publishableKey || !email || !password) fail("required environment variables are missing");

const target = inspectBootstrapTarget(process.env);
if (!target.ok || target.target !== "local") fail("local Supabase is required");

const client = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = await client.auth.signInWithPassword({ email, password });
if (signIn.error) fail("local superadmin sign-in did not succeed");

for (const featureKey of ["role_context_v2", "role_shells_v2"]) {
  const { error } = await client.rpc("set_platform_feature_flag", {
    p_feature_key: featureKey,
    p_enabled: enabled,
    p_enabled_environments: ["local"],
    p_rollout_percentage: 100,
  });
  if (error) fail("protected feature-flag RPC did not succeed");
}

console.log(`Local role-shell flags are ${enabled ? "enabled" : "disabled"} through the protected RPC.`);
