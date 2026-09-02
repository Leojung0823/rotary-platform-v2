import { isPublicHostname } from "./public-hostname.mjs";

const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const TEST_MARKER_PATTERN = /(?:staging|test|測試)/iu;
const RESERVED_TEST_DOMAIN_PATTERN = /(?:^|\.)(?:example\.(?:com|net|org)|test|invalid|example)$/iu;

function text(value) {
  return String(value ?? "").trim();
}

function isClearlyTestEmail(email) {
  const [localPart, domain] = email.split("@");
  return TEST_MARKER_PATTERN.test(localPart ?? "")
    && RESERVED_TEST_DOMAIN_PATTERN.test(domain ?? "");
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
 * Validate the protected staging acceptance for an operator without returning
 * any credential value. The operator identity must be a reserved test account;
 * a real member or production account must fail closed before Playwright runs.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function inspectStagingManagementAcceptanceInput(input = process.env) {
  const errors = [];
  const eventName = text(input.GITHUB_EVENT_NAME);
  const refName = text(input.GITHUB_REF_NAME);
  const githubSha = text(input.GITHUB_SHA).toLowerCase();
  const expectedSha = text(input.STAGING_EXPECTED_SHA).toLowerCase();
  const confirmation = text(input.STAGING_MANAGEMENT_ACCEPTANCE_CONFIRMATION);
  const siteUrl = validateHttpsOrigin(errors, text(input.STAGING_BASE_URL));
  const operatorEmail = text(input.STAGING_TEST_OPERATOR_EMAIL).toLowerCase();
  const operatorPassword = String(input.STAGING_TEST_OPERATOR_PASSWORD ?? "");
  const expectedClubName = text(input.STAGING_EXPECTED_CLUB_NAME);

  if (eventName !== "workflow_dispatch") errors.push("STAGING_MANAGEMENT_ACCEPTANCE_MANUAL_ONLY");
  if (refName !== "main") errors.push("STAGING_MANAGEMENT_ACCEPTANCE_MAIN_ONLY");
  if (!COMMIT_SHA_PATTERN.test(githubSha)) errors.push("GITHUB_SHA_INVALID");
  if (!COMMIT_SHA_PATTERN.test(expectedSha)) errors.push("STAGING_EXPECTED_SHA_INVALID");
  else if (expectedSha !== githubSha) errors.push("STAGING_EXPECTED_SHA_MISMATCH");
  if (confirmation !== "TEST-STAGING-MANAGEMENT") {
    errors.push("STAGING_MANAGEMENT_ACCEPTANCE_CONFIRMATION_MISMATCH");
  }

  if (!EMAIL_PATTERN.test(operatorEmail)
    || operatorEmail.length > 320
    || !isClearlyTestEmail(operatorEmail)) {
    errors.push("STAGING_TEST_OPERATOR_EMAIL_INVALID");
  }
  if (operatorPassword.length < 12
    || operatorPassword.length > 256
    || /[\r\n]/u.test(operatorPassword)) {
    errors.push("STAGING_TEST_OPERATOR_PASSWORD_INVALID");
  }
  if (!expectedClubName
    || expectedClubName.length > 160
    || !TEST_MARKER_PATTERN.test(expectedClubName)) {
    errors.push("STAGING_EXPECTED_CLUB_NAME_INVALID");
  }

  return {
    ok: errors.length === 0,
    eventName: eventName || "unknown",
    refName: refName || "unknown",
    commitSha: COMMIT_SHA_PATTERN.test(githubSha) ? githubSha : null,
    siteOrigin: siteUrl?.origin ?? null,
    credentialsConfigured: EMAIL_PATTERN.test(operatorEmail)
      && isClearlyTestEmail(operatorEmail)
      && operatorPassword.length >= 12,
    expectedClubConfigured: Boolean(expectedClubName),
    errors,
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function assertStagingManagementAcceptanceInput(input = process.env) {
  const result = inspectStagingManagementAcceptanceInput(input);
  if (!result.ok) {
    throw new Error(`Staging management acceptance input is invalid: ${result.errors.join(", ")}`);
  }
  return result;
}
