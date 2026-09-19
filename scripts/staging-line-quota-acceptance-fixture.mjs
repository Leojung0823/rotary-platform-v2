#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import {
  fixtureAccountValues,
  fixturePushLogValues,
  inspectStagingLineQuotaAcceptanceInput,
  isFixtureAccount,
  isFixturePushLog,
} from "../src/lib/staging-line-quota-acceptance.mjs";

const operation = process.argv[2];
const inspection = inspectStagingLineQuotaAcceptanceInput(process.env);

function fail(message) {
  console.error(`ERROR ${message}`);
  console.error("Staging LINE quota fixture stopped closed. No credential value was printed.");
  process.exit(1);
}

if (!new Set(["seed", "cleanup"]).has(operation)) fail("USAGE_REQUIRES_SEED_OR_CLEANUP");
if (!inspection.ok) {
  for (const error of inspection.errors) console.error(`ERROR ${error}`);
  fail("STAGING_LINE_QUOTA_INPUT_INVALID");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const fixtureId = process.env.STAGING_LINE_QUOTA_FIXTURE_ID;
const expectedClubName = process.env.STAGING_EXPECTED_CLUB_NAME.trim();

function requireRows(result, code) {
  if (result.error) fail(code);
  return result.data ?? [];
}

async function findTargetClub() {
  const clubs = requireRows(await admin
    .from("clubs")
    .select("id, club_code, club_name, club_status")
    .eq("club_name", expectedClubName), "STAGING_TEST_CLUB_LOOKUP_FAILED");
  if (clubs.length !== 1) fail("STAGING_TEST_CLUB_MUST_BE_UNIQUE");
  const club = clubs[0];
  if (club.club_status !== "active" || !/(?:staging|test|stg)/iu.test(club.club_code ?? "")) {
    fail("STAGING_TEST_CLUB_IDENTITY_INVALID");
  }
  return club;
}

async function seed() {
  const club = await findTargetClub();
  const activeAccounts = requireRows(await admin
    .from("line_oa_accounts")
    .select("id, club_id, display_name, basic_id, channel_id, channel_secret_env_key, access_token_env_key, webhook_secret_env_key, created_by_app_account_id")
    .eq("club_id", club.id)
    .neq("account_status", "disabled"), "STAGING_LINE_QUOTA_ACCOUNT_LOOKUP_FAILED");
  if (activeAccounts.length > 0) fail("STAGING_TEST_CLUB_ALREADY_HAS_ACTIVE_OA");

  const values = fixtureAccountValues({ fixtureId, clubId: club.id });
  const accountResult = await admin
    .from("line_oa_accounts")
    .insert({
      club_id: values.club_id,
      display_name: values.display_name,
      basic_id: values.basic_id,
      channel_id: values.channel_id,
      channel_secret_env_key: values.channel_secret_env_key,
      access_token_env_key: values.access_token_env_key,
      webhook_secret_env_key: values.webhook_secret_env_key,
      account_status: values.account_status,
      created_by_app_account_id: values.created_by_app_account_id,
    })
    .select("id, club_id, display_name, basic_id, channel_id, channel_secret_env_key, access_token_env_key, webhook_secret_env_key, created_by_app_account_id")
    .single();
  if (accountResult.error || !accountResult.data || !isFixtureAccount(accountResult.data, { fixtureId, clubId: club.id })) {
    fail("STAGING_LINE_QUOTA_ACCOUNT_SEED_FAILED");
  }

  const logResult = await admin
    .from("line_push_logs")
    .insert(fixturePushLogValues({ fixtureId, clubId: club.id, accountId: accountResult.data.id }))
    .select("id, line_oa_account_id, club_id, push_kind, payload_summary, failure_code")
    .single();
  if (logResult.error || !logResult.data || !isFixturePushLog(logResult.data, {
    fixtureId,
    clubId: club.id,
    accountId: accountResult.data.id,
  })) {
    fail("STAGING_LINE_QUOTA_LOG_SEED_FAILED");
  }

  console.log("Staging LINE quota fixture seeded for the protected browser assertion.");
  console.log("The fixture uses a synthetic push log only; no LINE API request was made.");
}

async function cleanup() {
  const club = await findTargetClub();
  const accounts = requireRows(await admin
    .from("line_oa_accounts")
    .select("id, club_id, display_name, basic_id, channel_id, channel_secret_env_key, access_token_env_key, webhook_secret_env_key, created_by_app_account_id")
    .eq("club_id", club.id)
    .eq("display_name", fixtureAccountValues({ fixtureId, clubId: club.id }).display_name), "STAGING_LINE_QUOTA_ACCOUNT_LOOKUP_FAILED");
  if (accounts.length === 0) {
    console.log("Staging LINE quota fixture was already absent; cleanup is idempotent.");
    return;
  }
  if (accounts.length !== 1 || !isFixtureAccount(accounts[0], { fixtureId, clubId: club.id })) {
    fail("STAGING_LINE_QUOTA_ACCOUNT_CLEANUP_IDENTITY_INVALID");
  }
  const account = accounts[0];
  const [logs, followers, webhooks, preferences] = await Promise.all([
    admin.from("line_push_logs").select("id, line_oa_account_id, club_id, push_kind, payload_summary, failure_code").eq("line_oa_account_id", account.id),
    admin.from("line_oa_followers").select("id").eq("line_oa_account_id", account.id),
    admin.from("line_webhooks").select("id").eq("line_oa_account_id", account.id),
    admin.from("line_oa_onboarding_preferences").select("app_account_id, club_id").eq("line_oa_account_id", account.id),
  ]);
  const logRows = requireRows(logs, "STAGING_LINE_QUOTA_LOG_LOOKUP_FAILED");
  if (logRows.some((log) => !isFixturePushLog(log, { fixtureId, clubId: club.id, accountId: account.id }))) {
    fail("STAGING_LINE_QUOTA_NON_FIXTURE_LOG_FOUND");
  }
  if (requireRows(followers, "STAGING_LINE_QUOTA_FOLLOWER_LOOKUP_FAILED").length > 0
    || requireRows(webhooks, "STAGING_LINE_QUOTA_WEBHOOK_LOOKUP_FAILED").length > 0
    || requireRows(preferences, "STAGING_LINE_QUOTA_PREFERENCE_LOOKUP_FAILED").length > 0) {
    fail("STAGING_LINE_QUOTA_ACCOUNT_HAS_NON_FIXTURE_CHILDREN");
  }

  if (logRows.length > 0) {
    const deletedLogs = await admin.from("line_push_logs").delete().eq("line_oa_account_id", account.id);
    if (deletedLogs.error) fail("STAGING_LINE_QUOTA_LOG_CLEANUP_FAILED");
  }
  const deletedAccount = await admin
    .from("line_oa_accounts")
    .delete()
    .eq("id", account.id)
    .eq("club_id", club.id)
    .eq("display_name", fixtureAccountValues({ fixtureId, clubId: club.id }).display_name);
  if (deletedAccount.error) fail("STAGING_LINE_QUOTA_ACCOUNT_CLEANUP_FAILED");
  console.log("Staging LINE quota fixture cleaned up; no synthetic OA or push log was left behind.");
}

try {
  if (operation === "seed") await seed();
  else await cleanup();
} catch (error) {
  if (error?.code?.startsWith?.("STAGING_")) fail(error.code);
  fail("STAGING_LINE_QUOTA_FIXTURE_FAILED");
}
