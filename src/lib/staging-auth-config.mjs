const PROJECT_REF_PATTERN = /^[a-z0-9]{16,32}$/u;

export const STAGING_AUTH_ORIGIN = "https://rotary-platform-v2-mrha.onrender.com";
export const RECOVERY_EMAIL_SUBJECT = "扶輪平台密碼重設";
export const REQUIRED_RECOVERY_REDIRECTS = [
  `${STAGING_AUTH_ORIGIN}/auth/callback`,
  `${STAGING_AUTH_ORIGIN}/auth/callback?next=/reset-password`,
];

function text(value) {
  return String(value ?? "").trim();
}

function isValidProjectRef(value) {
  return PROJECT_REF_PATTERN.test(text(value));
}

function isApprovedStagingOrigin(value) {
  try {
    const parsed = new URL(text(value));
    return parsed.origin === STAGING_AUTH_ORIGIN
      && parsed.pathname === "/"
      && parsed.search === ""
      && parsed.hash === ""
      && parsed.username === ""
      && parsed.password === "";
  } catch {
    return false;
  }
}

function splitRedirects(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(",").map(text).filter(Boolean);
}

function hasRecoveryCallbackTemplate(template) {
  return template.includes("/auth/callback?token_hash={{ .TokenHash }}")
    && !template.includes("{{ .ConfirmationURL }}");
}

/**
 * Validate all local inputs before making a staging Supabase Management API
 * request. The return value deliberately contains no credential or project
 * values.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function inspectStagingAuthConfigInput(input = process.env) {
  const errors = [];
  if (text(input.APP_ENV) !== "staging") errors.push("STAGING_APP_ENV_REQUIRED");
  if (text(input.TRUSTED_ADMIN_ENVIRONMENT) !== "staging") {
    errors.push("STAGING_TRUSTED_BOUNDARY_REQUIRED");
  }
  if (!isValidProjectRef(input.SUPABASE_PROJECT_REF)) errors.push("SUPABASE_PROJECT_REF_INVALID");
  // Trim before measuring: a token pasted into a GitHub secret from a web page
  // can carry non-ASCII whitespace such as U+00A0, which fetch forwards into
  // the Authorization header unchanged and the hosted API then rejects as a
  // bad credential. Trimming fixes that, and the surviving-character check
  // names any remaining stray character instead of letting it reach the API as
  // an opaque 401.
  const accessToken = String(input.SUPABASE_ACCESS_TOKEN ?? "").trim();
  if (accessToken.length < 20) errors.push("SUPABASE_ACCESS_TOKEN_INVALID");
  else if (!/^[\x21-\x7e]+$/u.test(accessToken)) {
    errors.push("SUPABASE_ACCESS_TOKEN_HAS_UNEXPECTED_CHARACTERS");
  }
  if (!isApprovedStagingOrigin(input.STAGING_BASE_URL)) {
    errors.push("STAGING_BASE_URL_NOT_APPROVED");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Build the redirect half of the hosted Auth patch. These fields are accepted
 * on every Supabase plan. Existing redirect entries are kept so this repair
 * cannot silently remove an already-approved staging callback.
 * @param {{ current?: Record<string, unknown> }} input
 */
export function buildStagingRedirectPatch({ current = {} } = {}) {
  const redirects = [...new Set([
    ...splitRedirects(current.uri_allow_list),
    ...REQUIRED_RECOVERY_REDIRECTS,
  ])];
  return {
    site_url: STAGING_AUTH_ORIGIN,
    uri_allow_list: redirects.join(","),
  };
}

/**
 * Build the recovery-email half of the hosted Auth patch. Supabase rejects
 * these two fields on a free tier project that still uses the default email
 * provider, so they are sent separately from the redirect fields.
 * @param {{ recoveryTemplate: string }} input
 */
export function buildStagingRecoveryEmailPatch({ recoveryTemplate }) {
  if (!hasRecoveryCallbackTemplate(recoveryTemplate)) {
    throw new Error("RECOVERY_TEMPLATE_CALLBACK_INVALID");
  }
  return {
    mailer_subjects_recovery: RECOVERY_EMAIL_SUBJECT,
    mailer_templates_recovery_content: recoveryTemplate,
  };
}

/**
 * Build the full hosted Auth patch. Kept as the combined contract for the case
 * where both halves can be applied in one request.
 * @param {{ current?: Record<string, unknown>, recoveryTemplate: string }} input
 */
export function buildStagingAuthConfigPatch({ current = {}, recoveryTemplate }) {
  return {
    ...buildStagingRedirectPatch({ current }),
    ...buildStagingRecoveryEmailPatch({ recoveryTemplate }),
  };
}

/**
 * Verify the redirect fields. These are always enforced: a staging deployment
 * whose callback list is wrong is the failure this repair exists to prevent.
 * @param {{ config?: Record<string, unknown> }} input
 */
export function inspectStagingRedirectConfig({ config = {} } = {}) {
  const errors = [];
  if (text(config.site_url).replace(/\/$/u, "") !== STAGING_AUTH_ORIGIN) {
    errors.push("STAGING_SITE_URL_MISMATCH");
  }
  const redirects = new Set(splitRedirects(config.uri_allow_list));
  for (const redirect of REQUIRED_RECOVERY_REDIRECTS) {
    if (!redirects.has(redirect)) errors.push("STAGING_RECOVERY_REDIRECT_MISSING");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Verify the recovery-email fields. Only meaningful once the hosted project
 * actually accepted the email patch.
 * @param {{ config?: Record<string, unknown>, recoveryTemplate: string }} input
 */
export function inspectStagingRecoveryEmailConfig({ config = {}, recoveryTemplate }) {
  const errors = [];
  if (text(config.mailer_subjects_recovery) !== RECOVERY_EMAIL_SUBJECT) {
    errors.push("STAGING_RECOVERY_SUBJECT_MISMATCH");
  }
  if (text(config.mailer_templates_recovery_content) !== text(recoveryTemplate)) {
    errors.push("STAGING_RECOVERY_TEMPLATE_MISMATCH");
  }
  if (!hasRecoveryCallbackTemplate(recoveryTemplate)) errors.push("RECOVERY_TEMPLATE_CALLBACK_INVALID");
  return { ok: errors.length === 0, errors };
}

/**
 * Verify every field changed by the repair after the Management API PATCH.
 * @param {{ config?: Record<string, unknown>, recoveryTemplate: string }} input
 */
export function inspectStagingAuthConfig({ config = {}, recoveryTemplate }) {
  const redirect = inspectStagingRedirectConfig({ config });
  const email = inspectStagingRecoveryEmailConfig({ config, recoveryTemplate });
  const errors = [...redirect.errors, ...email.errors];
  return { ok: errors.length === 0, errors };
}

/**
 * Recognise the hosted refusal to modify email templates on a free tier
 * project that still uses the default email provider. This is a plan
 * limitation rather than a defect in this repository, so the caller reports it
 * instead of retrying. Matching is deliberately narrow: any other 400 stays a
 * hard failure.
 * @param {number} status
 * @param {string} responseText
 */
export function isEmailTemplatePlanRestriction(status, responseText) {
  if (status !== 400) return false;
  const body = String(responseText ?? "").toLowerCase();
  if (!body.includes("email template")) return false;
  return body.includes("free tier")
    || body.includes("upgrade your plan")
    || body.includes("custom smtp");
}
