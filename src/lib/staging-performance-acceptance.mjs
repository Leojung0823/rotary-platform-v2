import { isPublicHostname } from "./public-hostname.mjs";

const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PERFORMANCE_CONFIRMATION = "TEST-STAGING-PERFORMANCE";
const MIN_SAMPLE_COUNT = 1;
const MAX_SAMPLE_COUNT = 5;
const PERFORMANCE_CACHE_MODES = ["cold", "warm"];

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
  if (!isPublicHostname(parsed.hostname)) errors.push("STAGING_BASE_URL_PUBLIC_HOST_REQUIRED");
  return parsed;
}

function validateCredentials(errors, input, prefix) {
  const email = text(input[`${prefix}_EMAIL`]);
  const password = String(input[`${prefix}_PASSWORD`] ?? "");

  if (!EMAIL_PATTERN.test(email) || email.length > 320) {
    errors.push(`${prefix}_EMAIL_INVALID`);
  }
  if (password.length < 12 || password.length > 256 || /[\r\n]/u.test(password)) {
    errors.push(`${prefix}_PASSWORD_INVALID`);
  }

  return {
    email,
    valid: EMAIL_PATTERN.test(email)
      && email.length <= 320
      && password.length >= 12
      && password.length <= 256
      && !/[\r\n]/u.test(password),
  };
}

function parseSampleCount(errors, rawValue) {
  const value = text(rawValue);
  if (!/^\d+$/u.test(value)) {
    errors.push("STAGING_PERFORMANCE_SAMPLE_COUNT_INVALID");
    return null;
  }

  const count = Number(value);
  if (!Number.isInteger(count) || count < MIN_SAMPLE_COUNT || count > MAX_SAMPLE_COUNT) {
    errors.push("STAGING_PERFORMANCE_SAMPLE_COUNT_OUT_OF_RANGE");
    return null;
  }
  return count;
}

function parseCacheMode(errors, rawValue) {
  const value = text(rawValue).toLowerCase();
  if (!PERFORMANCE_CACHE_MODES.includes(value)) {
    errors.push("STAGING_PERFORMANCE_CACHE_MODE_INVALID");
    return null;
  }
  return value;
}

/**
 * Validate a protected, manually dispatched, staging-only performance run.
 * The expected SHA is the revision currently deployed to staging. It may be
 * an ancestor of the workflow checkout because documentation-only commits do
 * not require a new staging deployment.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function inspectStagingPerformanceAcceptanceInput(input = process.env) {
  const errors = [];
  const eventName = text(input.GITHUB_EVENT_NAME);
  const refName = text(input.GITHUB_REF_NAME);
  const workflowSha = text(input.GITHUB_SHA).toLowerCase();
  const expectedSha = text(input.STAGING_EXPECTED_SHA).toLowerCase();
  const confirmation = text(input.STAGING_PERFORMANCE_CONFIRMATION);
  const siteUrl = validateHttpsOrigin(errors, text(input.STAGING_BASE_URL));
  const member = validateCredentials(errors, input, "STAGING_TEST_MEMBER");
  const operator = validateCredentials(errors, input, "STAGING_TEST_OPERATOR");
  const expectedClubName = text(input.STAGING_EXPECTED_CLUB_NAME);
  const sampleCount = parseSampleCount(errors, input.STAGING_PERFORMANCE_SAMPLE_COUNT);
  const cacheMode = parseCacheMode(errors, input.STAGING_PERFORMANCE_CACHE_MODE);

  if (eventName !== "workflow_dispatch") errors.push("STAGING_PERFORMANCE_MANUAL_ONLY");
  if (refName !== "main") errors.push("STAGING_PERFORMANCE_MAIN_ONLY");
  if (!COMMIT_SHA_PATTERN.test(workflowSha)) errors.push("GITHUB_SHA_INVALID");
  if (!COMMIT_SHA_PATTERN.test(expectedSha)) errors.push("STAGING_EXPECTED_SHA_INVALID");
  if (confirmation !== PERFORMANCE_CONFIRMATION) {
    errors.push("STAGING_PERFORMANCE_CONFIRMATION_MISMATCH");
  }
  if (!expectedClubName || expectedClubName.length > 160) {
    errors.push("STAGING_EXPECTED_CLUB_NAME_INVALID");
  }
  if (member.email && operator.email && member.email.toLowerCase() === operator.email.toLowerCase()) {
    errors.push("STAGING_PERFORMANCE_IDENTITIES_MUST_DIFFER");
  }

  return {
    ok: errors.length === 0,
    eventName: eventName || "unknown",
    refName: refName || "unknown",
    workflowSha: COMMIT_SHA_PATTERN.test(workflowSha) ? workflowSha : null,
    expectedSha: COMMIT_SHA_PATTERN.test(expectedSha) ? expectedSha : null,
    siteOrigin: siteUrl?.origin ?? null,
    credentialsConfigured: member.valid && operator.valid && member.email !== operator.email,
    expectedClubConfigured: Boolean(expectedClubName),
    sampleCount,
    cacheMode,
    errors,
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function assertStagingPerformanceAcceptanceInput(input = process.env) {
  const result = inspectStagingPerformanceAcceptanceInput(input);
  if (!result.ok) {
    throw new Error(`Staging performance acceptance input is invalid: ${result.errors.join(", ")}`);
  }
  return result;
}

export {
  PERFORMANCE_CONFIRMATION,
  MIN_SAMPLE_COUNT,
  MAX_SAMPLE_COUNT,
  PERFORMANCE_CACHE_MODES,
};
