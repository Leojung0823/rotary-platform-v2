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
  "birthday_wishes_v2",
  "birthday_wishes_collection_v1",
  "line_oa_event_push_v1",
  "line_oa_auto_pairing_v1",
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
  const stdin = process.stdin;
  const stdout = process.stdout;
  const wasRaw = Boolean(stdin.isRaw);
  stdout.write("Platform admin password (input hidden): ");
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();

  return await new Promise((resolve, reject) => {
    let value = "";
    const finish = (error, result) => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(result);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("password prompt cancelled"));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish(null, value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else {
          value += character;
        }
      }
    };
    stdin.on("data", onData);
  });
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
const expectedRolloutPercentage = enabled ? 100 : 0;
for (const featureKey of keys) {
  const { data, error } = await client.rpc("set_platform_feature_flag", {
    p_feature_key: featureKey,
    p_enabled: enabled,
    p_enabled_environments: [target.target],
    p_rollout_percentage: expectedRolloutPercentage,
  });
  // A failure here is almost always missing platform-admin authority, which the
  // RPC refuses without explaining -- deliberately.
  if (error) fail(`the protected RPC rejected ${featureKey}`);

  // Do not report success based only on the absence of an RPC error. The
  // protected mutation must return the exact state the caller requested, so a
  // stale or incompatible database cannot be mistaken for a completed rollout.
  const returnedFlag = Array.isArray(data) ? data[0] : data;
  if (
    !returnedFlag
    || returnedFlag.feature_key !== featureKey
    || returnedFlag.enabled !== enabled
    || returnedFlag.rollout_percentage !== expectedRolloutPercentage
    || !Array.isArray(returnedFlag.enabled_environments)
    || returnedFlag.enabled_environments.length !== 1
    || returnedFlag.enabled_environments[0] !== target.target
  ) {
    fail(`the protected RPC returned an unexpected state for ${featureKey}`);
  }
  results.push(featureKey);
}

await client.auth.signOut();
console.log(
  `${results.length} flag(s) ${enabled ? "enabled" : "disabled"} for ${target.target}: ${results.join(", ")}`,
);
console.log("No credential values were printed.");
