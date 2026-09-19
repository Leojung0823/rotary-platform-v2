import { isPublicHostname } from "./public-hostname.mjs";

const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const FIXTURE_ID_PATTERN = /^quota-[0-9]+$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const TEST_MARKER_PATTERN = /(?:staging|test|測試)/iu;
const RESERVED_TEST_DOMAIN_PATTERN = /(?:^|\.)(?:example\.(?:com|net|org)|test|invalid|example)$/iu;

export const STAGING_LINE_QUOTA_CONFIRMATION = "TEST-STAGING-LINE-QUOTA";
export const STAGING_LINE_QUOTA_DISPLAY_NAME = "STAGING TEST ONLY - LINE quota fixture";

function text(value) {
  return String(value ?? "").trim();
}

function isClearlyTestEmail(email) {
  const [localPart, domain] = email.split("@");
  return TEST_MARKER_PATTERN.test(localPart ?? "") && RESERVED_TEST_DOMAIN_PATTERN.test(domain ?? "");
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

/**
 * Validate the protected hosted quota notice acceptance boundary.
 * Credential values are inspected but never returned.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function inspectStagingLineQuotaAcceptanceInput(input = process.env) {
  const errors = [];
  const eventName = text(input.GITHUB_EVENT_NAME);
  const refName = text(input.GITHUB_REF_NAME);
  const githubSha = text(input.GITHUB_SHA).toLowerCase();
  const expectedSha = text(input.STAGING_EXPECTED_SHA).toLowerCase();
  const confirmation = text(input.STAGING_LINE_QUOTA_ACCEPTANCE_CONFIRMATION);
  const siteUrl = validateHttpsOrigin(errors, text(input.STAGING_BASE_URL));
  const expectedClubName = text(input.STAGING_EXPECTED_CLUB_NAME);
  const operatorEmail = text(input.STAGING_TEST_OPERATOR_EMAIL).toLowerCase();
  const operatorPassword = String(input.STAGING_TEST_OPERATOR_PASSWORD ?? "");
  const memberEmail = text(input.STAGING_TEST_MEMBER_EMAIL).toLowerCase();
  const memberPassword = String(input.STAGING_TEST_MEMBER_PASSWORD ?? "");
  const projectRef = text(input.SUPABASE_PROJECT_REF);
  const supabaseUrl = text(input.NEXT_PUBLIC_SUPABASE_URL ?? input.SUPABASE_URL);
  const serviceRoleKey = String(input.SUPABASE_SERVICE_ROLE_KEY ?? "");
  const fixtureId = text(input.STAGING_LINE_QUOTA_FIXTURE_ID);

  if (eventName !== "workflow_dispatch") errors.push("STAGING_LINE_QUOTA_MANUAL_ONLY");
  if (refName !== "main") errors.push("STAGING_LINE_QUOTA_MAIN_ONLY");
  if (!COMMIT_SHA_PATTERN.test(githubSha)) errors.push("GITHUB_SHA_INVALID");
  if (!COMMIT_SHA_PATTERN.test(expectedSha)) errors.push("STAGING_EXPECTED_SHA_INVALID");
  else if (expectedSha !== githubSha) errors.push("STAGING_EXPECTED_SHA_MISMATCH");
  if (confirmation !== STAGING_LINE_QUOTA_CONFIRMATION) {
    errors.push("STAGING_LINE_QUOTA_CONFIRMATION_MISMATCH");
  }
  if (text(input.APP_ENV) !== "staging") errors.push("STAGING_APP_ENV_REQUIRED");
  if (text(input.TRUSTED_ADMIN_ENVIRONMENT) !== "staging") {
    errors.push("STAGING_TRUSTED_BOUNDARY_REQUIRED");
  }

  if (!projectRef || !/^[a-z0-9]{16,32}$/u.test(projectRef)) {
    errors.push("SUPABASE_PROJECT_REF_INVALID");
  }
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || !isPublicHostname(parsed.hostname)) {
      errors.push("STAGING_SUPABASE_HTTPS_ORIGIN_REQUIRED");
    }
    if (/^[a-z0-9]{16,32}$/u.test(projectRef)
      && parsed.hostname.toLowerCase() !== `${projectRef}.supabase.co`) {
      errors.push("STAGING_SUPABASE_HOST_REF_MISMATCH");
    }
  } catch {
    errors.push("STAGING_SUPABASE_URL_INVALID");
  }

  if (!expectedClubName || expectedClubName.length > 160 || !TEST_MARKER_PATTERN.test(expectedClubName)) {
    errors.push("STAGING_TEST_CLUB_NAME_INVALID");
  }
  if (!EMAIL_PATTERN.test(operatorEmail)
    || operatorEmail.length > 320
    || !isClearlyTestEmail(operatorEmail)) {
    errors.push("STAGING_TEST_OPERATOR_EMAIL_INVALID");
  }
  if (operatorPassword.length < 12 || operatorPassword.length > 256 || /[\r\n]/u.test(operatorPassword)) {
    errors.push("STAGING_TEST_OPERATOR_PASSWORD_INVALID");
  }
  if (!EMAIL_PATTERN.test(memberEmail)
    || memberEmail.length > 320
    || !isClearlyTestEmail(memberEmail)) {
    errors.push("STAGING_TEST_MEMBER_EMAIL_INVALID");
  }
  if (memberPassword.length < 12 || memberPassword.length > 256 || /[\r\n]/u.test(memberPassword)) {
    errors.push("STAGING_TEST_MEMBER_PASSWORD_INVALID");
  }
  if (!FIXTURE_ID_PATTERN.test(fixtureId)) errors.push("STAGING_LINE_QUOTA_FIXTURE_ID_INVALID");
  if (serviceRoleKey.length < 20 || /[\r\n]/u.test(serviceRoleKey)) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY_INVALID");
  }

  return {
    ok: errors.length === 0,
    eventName: eventName || "unknown",
    refName: refName || "unknown",
    commitSha: COMMIT_SHA_PATTERN.test(githubSha) ? githubSha : null,
    siteOrigin: siteUrl?.origin ?? null,
    credentialsConfigured: EMAIL_PATTERN.test(operatorEmail)
      && isClearlyTestEmail(operatorEmail)
      && operatorPassword.length >= 12
      && EMAIL_PATTERN.test(memberEmail)
      && isClearlyTestEmail(memberEmail)
      && memberPassword.length >= 12
      && serviceRoleKey.length >= 20,
    expectedClubConfigured: Boolean(expectedClubName),
    fixtureId: FIXTURE_ID_PATTERN.test(fixtureId) ? fixtureId : null,
    errors,
  };
}

export function fixtureMarker(fixtureId) {
  if (!FIXTURE_ID_PATTERN.test(text(fixtureId))) throw new Error("STAGING_LINE_QUOTA_FIXTURE_ID_INVALID");
  return `rotary-platform-v2:${text(fixtureId)}`;
}

export function fixtureEnvironmentKey(fixtureId, suffix) {
  const normalized = text(fixtureId).replace(/[^a-z0-9]/giu, "_").toUpperCase();
  return `LINE_OA_${normalized}_${suffix}`;
}

export function fixtureAccountValues({ fixtureId, clubId }) {
  const marker = fixtureMarker(fixtureId);
  return {
    club_id: clubId,
    display_name: `${STAGING_LINE_QUOTA_DISPLAY_NAME} ${fixtureId}`,
    basic_id: `@${fixtureId}`,
    channel_id: `staging-${fixtureId}`,
    channel_secret_env_key: fixtureEnvironmentKey(fixtureId, "CHANNEL_SECRET"),
    access_token_env_key: fixtureEnvironmentKey(fixtureId, "CHANNEL_ACCESS_TOKEN"),
    webhook_secret_env_key: fixtureEnvironmentKey(fixtureId, "CHANNEL_SECRET"),
    account_status: "active",
    created_by_app_account_id: null,
    marker,
  };
}

export function fixturePushLogValues({ fixtureId, clubId, accountId }) {
  return {
    line_oa_account_id: accountId,
    club_id: clubId,
    requested_by_app_account_id: null,
    push_kind: "multicast",
    recipient_count: 700,
    payload_summary: {
      test_marker: fixtureMarker(fixtureId),
      message_type: "text",
      batch_count: 2,
      sent_batch_count: 1,
      delivered_recipient_count: 500,
    },
    delivery_status: "failed",
    provider_request_id: null,
    failure_code: "rate_limited",
    completed_at: new Date().toISOString(),
  };
}

export function isFixtureAccount(account, { fixtureId, clubId }) {
  const values = fixtureAccountValues({ fixtureId, clubId });
  return account?.club_id === clubId
    && account.display_name === values.display_name
    && account.basic_id === values.basic_id
    && account.channel_id === values.channel_id
    && account.channel_secret_env_key === values.channel_secret_env_key
    && account.access_token_env_key === values.access_token_env_key
    && account.webhook_secret_env_key === values.webhook_secret_env_key
    && account.created_by_app_account_id === null;
}

export function isFixturePushLog(log, { fixtureId, clubId, accountId }) {
  return log?.club_id === clubId
    && log.line_oa_account_id === accountId
    && log.push_kind === "multicast"
    && log.failure_code === "rate_limited"
    && log.payload_summary?.test_marker === fixtureMarker(fixtureId);
}
