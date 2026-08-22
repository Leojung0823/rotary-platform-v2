import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { inspectBootstrapTarget } from "../src/lib/bootstrap-target.mjs";

// Turning a flag on is what actually exposes a finished feature to members, so
// it goes through the same protected RPC and audit trail as any other rollout
// change -- never a direct table write. The RPC is executable by `authenticated`
// only and rechecks platform-admin authority in its own body, which is why this
// signs in rather than using a service-role key.

// Every key the platform currently knows about, and whether the feature behind
// it is actually built. The list is empty of unimplemented keys today; keep the
// split, because a key is usually declared before the feature lands and
// enabling one of those exposes nothing at best.
const IMPLEMENTED = [
  "role_context_v2",
  "role_shells_v2",
  "member_home_v2",
  "checkin_qr_v2",
  "checkin_gps_v2",
  "attendance_ui_v2",
  "announcements_v09",
  "blessing_iou_v1",
  "blessing_iou_collections_v1",
  "blessing_iou_reporting_v1",
];
const UNIMPLEMENTED = [];

function fail(message) {
  throw new Error(`Feature flag update failed: ${message}`);
}

const [, , action = "", ...requested] = process.argv;
if (action !== "enable" && action !== "disable") {
  fail("expected `enable` or `disable` as the first argument, then flag keys or `--all-implemented`");
}

const keys = requested.includes("--all-implemented")
  ? IMPLEMENTED
  : requested.filter((value) => !value.startsWith("--"));
if (keys.length === 0) fail("no feature flag keys given");

for (const key of keys) {
  if (UNIMPLEMENTED.includes(key)) {
    fail(`${key} has no implementation behind it; refusing to enable a flag that exposes nothing`);
  }
  if (!IMPLEMENTED.includes(key)) {
    fail(`${key} is not a known feature flag key`);
  }
}

/**
 * Asks for the password on the terminal with the echo suppressed, so it never
 * reaches the shell history, the process list, or a file. Only used when the
 * variable is absent and there is a terminal to ask on -- CI keeps passing it
 * through the environment.
 */
async function promptForPassword() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  process.stdout.write("Platform admin password (input hidden): ");
  const muted = (chunk, encoding, callback) => {
    if (!rl.line) process.stdout.write(chunk, encoding);
    callback();
  };
  const original = rl.output._write.bind(rl.output);
  rl.output._write = muted;
  try {
    return await new Promise((resolve) => rl.question("", resolve));
  } finally {
    rl.output._write = original;
    rl.close();
    process.stdout.write("\n");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase()
  ?? process.env.BOOTSTRAP_SUPERADMIN_EMAIL?.trim().toLowerCase();
let password = process.env.PLATFORM_ADMIN_PASSWORD ?? process.env.BOOTSTRAP_SUPERADMIN_PASSWORD;
if (!url || !publishableKey || !email) {
  fail("NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and PLATFORM_ADMIN_EMAIL are required");
}
if (!password && process.stdin.isTTY) password = await promptForPassword();
if (!password) fail("no password supplied and no terminal to ask on");

// Reuses the bootstrap boundary: automatic locally, explicitly confirmable on
// staging, and refused outright on production.
const target = inspectBootstrapTarget(process.env);
if (!target.ok) fail(`target is not usable (${target.errors.join(", ") || "unknown"})`);
if (target.target !== "local" && target.target !== "staging") {
  fail(`refusing to change flags on a ${target.target} target`);
}

const client = createClient(url, publishableKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const signIn = await client.auth.signInWithPassword({ email, password });
if (signIn.error) fail("platform admin sign-in did not succeed");

const enabled = action === "enable";
const results = [];
for (const featureKey of keys) {
  const { error } = await client.rpc("set_platform_feature_flag", {
    p_feature_key: featureKey,
    p_enabled: enabled,
    p_enabled_environments: [target.target],
    p_rollout_percentage: enabled ? 100 : 0,
  });
  // A failure here is almost always missing platform-admin authority, which the
  // RPC refuses without explaining -- deliberately.
  if (error) fail(`the protected RPC rejected ${featureKey}`);
  results.push(featureKey);
}

await client.auth.signOut();
console.log(
  `${results.length} flag(s) ${enabled ? "enabled" : "disabled"} for ${target.target}: ${results.join(", ")}`,
);
console.log("No credential values were printed.");
