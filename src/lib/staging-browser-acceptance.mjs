const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function text(value) {
  return String(value ?? "").trim();
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
  if (LOCAL_HOSTS.has(parsed.hostname)) errors.push("STAGING_BASE_URL_PUBLIC_HOST_REQUIRED");
  return parsed;
}

/**
 * Validate a protected, manually dispatched hosted-staging browser acceptance run
 * without returning the test account credentials.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function inspectStagingBrowserAcceptanceInput(input = process.env) {
  const errors = [];
  const eventName = text(input.GITHUB_EVENT_NAME);
  const refName = text(input.GITHUB_REF_NAME);
  const githubSha = text(input.GITHUB_SHA).toLowerCase();
  const expectedSha = text(input.STAGING_EXPECTED_SHA).toLowerCase();
  const confirmation = text(input.STAGING_ACCEPTANCE_CONFIRMATION);
  const siteUrl = validateHttpsOrigin(errors, text(input.STAGING_BASE_URL));
  const memberEmail = text(input.STAGING_TEST_MEMBER_EMAIL);
  const memberPassword = String(input.STAGING_TEST_MEMBER_PASSWORD ?? "");
  const expectedClubName = text(input.STAGING_EXPECTED_CLUB_NAME);

  if (eventName !== "workflow_dispatch") errors.push("STAGING_ACCEPTANCE_MANUAL_ONLY");
  if (refName !== "main") errors.push("STAGING_ACCEPTANCE_MAIN_ONLY");
  if (!COMMIT_SHA_PATTERN.test(githubSha)) errors.push("GITHUB_SHA_INVALID");
  if (!COMMIT_SHA_PATTERN.test(expectedSha)) errors.push("STAGING_EXPECTED_SHA_INVALID");
  else if (expectedSha !== githubSha) errors.push("STAGING_EXPECTED_SHA_MISMATCH");
  if (confirmation !== "TEST-STAGING") errors.push("STAGING_ACCEPTANCE_CONFIRMATION_MISMATCH");

  if (!EMAIL_PATTERN.test(memberEmail) || memberEmail.length > 320) {
    errors.push("STAGING_TEST_MEMBER_EMAIL_INVALID");
  }
  if (memberPassword.length < 12 || memberPassword.length > 256 || /[\r\n]/u.test(memberPassword)) {
    errors.push("STAGING_TEST_MEMBER_PASSWORD_INVALID");
  }
  if (!expectedClubName || expectedClubName.length > 160) {
    errors.push("STAGING_EXPECTED_CLUB_NAME_INVALID");
  }

  return {
    ok: errors.length === 0,
    eventName: eventName || "unknown",
    refName: refName || "unknown",
    commitSha: COMMIT_SHA_PATTERN.test(githubSha) ? githubSha : null,
    siteOrigin: siteUrl?.origin ?? null,
    credentialsConfigured: EMAIL_PATTERN.test(memberEmail) && memberPassword.length >= 12,
    expectedClubConfigured: Boolean(expectedClubName),
    errors,
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function assertStagingBrowserAcceptanceInput(input = process.env) {
  const result = inspectStagingBrowserAcceptanceInput(input);
  if (!result.ok) {
    throw new Error(`Staging browser acceptance input is invalid: ${result.errors.join(", ")}`);
  }
  return result;
}
