import { isPublicHostname } from "./public-hostname.mjs";

const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const PROJECT_REF_PATTERN = /^[a-z0-9]{16,32}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const RUN_ID_PATTERN = /^[1-9]\d{0,19}$/u;

function text(value) {
  return String(value ?? "").trim();
}

function validatePublicHttpsUrl(errors, name, rawValue, { originOnly = false } = {}) {
  const initialErrorCount = errors.length;
  if (!rawValue) {
    errors.push(`${name}_REQUIRED`);
    return null;
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    errors.push(`${name}_INVALID`);
    return null;
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) {
    errors.push(`${name}_HTTPS_REQUIRED`);
  }
  if (originOnly && (parsed.pathname !== "/" || parsed.search)) {
    errors.push(`${name}_ORIGIN_ONLY`);
  }
  if (!isPublicHostname(parsed.hostname)) {
    errors.push(`${name}_PUBLIC_HOST_REQUIRED`);
  }
  return errors.length === initialErrorCount ? parsed : null;
}

function configuredSecret(errors, input, name, predicate = (value) => Boolean(value)) {
  const value = String(input[name] ?? "");
  if (!predicate(value)) errors.push(`${name}_INVALID`);
  return predicate(value);
}

/**
 * Validate a protected staging go-live run without returning any credential values.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function inspectStagingGoLiveInput(input = process.env) {
  const errors = [];
  const eventName = text(input.GITHUB_EVENT_NAME);
  const refName = text(input.GITHUB_REF_NAME);
  const githubSha = text(input.GITHUB_SHA);
  const expectedSha = text(input.STAGING_EXPECTED_SHA);
  const planRunId = text(input.STAGING_PLAN_RUN_ID);
  const confirmation = text(input.STAGING_LAUNCH_CONFIRMATION);
  const backupConfirmation = text(input.STAGING_BACKUP_CONFIRMATION);
  const rawProvisionTestData = text(input.STAGING_PROVISION_TEST_DATA).toLowerCase();
  const provisionTestData = rawProvisionTestData === "true";
  const provisioningConfirmation = text(input.STAGING_PROVISIONING_CONFIRMATION);
  const projectRef = text(input.SUPABASE_PROJECT_REF);
  const siteUrl = validatePublicHttpsUrl(errors, "STAGING_BASE_URL", text(input.STAGING_BASE_URL), {
    originOnly: true,
  });
  const deployHook = validatePublicHttpsUrl(errors, "STAGING_DEPLOY_HOOK", text(input.STAGING_DEPLOY_HOOK));

  if (eventName !== "workflow_dispatch") errors.push("STAGING_GO_LIVE_MANUAL_ONLY");
  if (refName !== "main") errors.push("STAGING_GO_LIVE_MAIN_ONLY");
  if (!COMMIT_SHA_PATTERN.test(githubSha)) errors.push("GITHUB_SHA_INVALID");
  if (!COMMIT_SHA_PATTERN.test(expectedSha)) errors.push("STAGING_EXPECTED_SHA_INVALID");
  else if (expectedSha !== githubSha) errors.push("STAGING_EXPECTED_SHA_MISMATCH");
  if (!RUN_ID_PATTERN.test(planRunId)) errors.push("STAGING_PLAN_RUN_ID_INVALID");
  if (confirmation !== "LAUNCH-STAGING") errors.push("STAGING_LAUNCH_CONFIRMATION_MISMATCH");
  if (backupConfirmation !== "BACKUP-READY") errors.push("STAGING_BACKUP_CONFIRMATION_MISMATCH");
  if (!new Set(["true", "false"]).has(rawProvisionTestData)) {
    errors.push("STAGING_PROVISION_TEST_DATA_INVALID");
  }
  if (provisionTestData && provisioningConfirmation !== "PROVISION-STAGING-TEST-DATA") {
    errors.push("STAGING_PROVISIONING_CONFIRMATION_MISMATCH");
  }
  if (!PROJECT_REF_PATTERN.test(projectRef)) errors.push("SUPABASE_PROJECT_REF_INVALID");

  const credentialsConfigured = [
    configuredSecret(errors, input, "SUPABASE_ACCESS_TOKEN", (value) => value.length >= 20 && !/[\r\n]/u.test(value)),
    configuredSecret(errors, input, "SUPABASE_DB_PASSWORD", (value) => value.length >= 12 && !/[\r\n]/u.test(value)),
    configuredSecret(errors, input, "STAGING_TEST_MEMBER_EMAIL", (value) => EMAIL_PATTERN.test(value.trim()) && value.length <= 320),
    configuredSecret(errors, input, "STAGING_TEST_MEMBER_PASSWORD", (value) => value.length >= 12 && value.length <= 256 && !/[\r\n]/u.test(value)),
    configuredSecret(errors, input, "GITHUB_TOKEN", (value) => value.length >= 20 && !/[\r\n]/u.test(value)),
  ].every(Boolean);

  const expectedClubName = text(input.STAGING_EXPECTED_CLUB_NAME);
  if (!expectedClubName || expectedClubName.length > 160) {
    errors.push("STAGING_EXPECTED_CLUB_NAME_INVALID");
  }

  return {
    ok: errors.length === 0,
    eventName: eventName || "unknown",
    refName: refName || "unknown",
    commitSha: COMMIT_SHA_PATTERN.test(githubSha) ? githubSha : null,
    planRunId: RUN_ID_PATTERN.test(planRunId) ? planRunId : null,
    siteOrigin: siteUrl?.origin ?? null,
    projectRefSuffix: PROJECT_REF_PATTERN.test(projectRef) ? projectRef.slice(-4) : null,
    deploymentHookConfigured: Boolean(deployHook),
    credentialsConfigured,
    expectedClubConfigured: Boolean(expectedClubName),
    provisioningEnabled: provisionTestData,
    provisioningConfirmationValid: !provisionTestData
      || provisioningConfirmation === "PROVISION-STAGING-TEST-DATA",
    errors,
  };
}

export function assertStagingGoLiveInput(input = process.env) {
  const result = inspectStagingGoLiveInput(input);
  if (!result.ok) {
    throw new Error(`Staging go-live input is invalid: ${result.errors.join(", ")}`);
  }
  return result;
}
