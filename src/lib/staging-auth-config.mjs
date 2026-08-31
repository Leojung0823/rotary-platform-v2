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
  const accessToken = String(input.SUPABASE_ACCESS_TOKEN ?? "");
  if (accessToken.length < 20 || /[\r\n]/u.test(accessToken)) {
    errors.push("SUPABASE_ACCESS_TOKEN_INVALID");
  }
  if (!isApprovedStagingOrigin(input.STAGING_BASE_URL)) {
    errors.push("STAGING_BASE_URL_NOT_APPROVED");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Build the minimal hosted Auth patch. Existing redirect entries are kept so
 * this repair cannot silently remove an already-approved staging callback.
 * @param {{ current?: Record<string, unknown>, recoveryTemplate: string }} input
 */
export function buildStagingAuthConfigPatch({ current = {}, recoveryTemplate }) {
  if (!hasRecoveryCallbackTemplate(recoveryTemplate)) {
    throw new Error("RECOVERY_TEMPLATE_CALLBACK_INVALID");
  }

  const redirects = [...new Set([
    ...splitRedirects(current.uri_allow_list),
    ...REQUIRED_RECOVERY_REDIRECTS,
  ])];
  return {
    site_url: STAGING_AUTH_ORIGIN,
    uri_allow_list: redirects.join(","),
    mailer_subjects_recovery: RECOVERY_EMAIL_SUBJECT,
    mailer_templates_recovery_content: recoveryTemplate,
  };
}

/**
 * Verify the fields changed by the repair after the Management API PATCH.
 * @param {{ config?: Record<string, unknown>, recoveryTemplate: string }} input
 */
export function inspectStagingAuthConfig({ config = {}, recoveryTemplate }) {
  const errors = [];
  if (text(config.site_url).replace(/\/$/u, "") !== STAGING_AUTH_ORIGIN) {
    errors.push("STAGING_SITE_URL_MISMATCH");
  }
  const redirects = new Set(splitRedirects(config.uri_allow_list));
  for (const redirect of REQUIRED_RECOVERY_REDIRECTS) {
    if (!redirects.has(redirect)) errors.push("STAGING_RECOVERY_REDIRECT_MISSING");
  }
  if (text(config.mailer_subjects_recovery) !== RECOVERY_EMAIL_SUBJECT) {
    errors.push("STAGING_RECOVERY_SUBJECT_MISMATCH");
  }
  if (text(config.mailer_templates_recovery_content) !== text(recoveryTemplate)) {
    errors.push("STAGING_RECOVERY_TEMPLATE_MISMATCH");
  }
  if (!hasRecoveryCallbackTemplate(recoveryTemplate)) errors.push("RECOVERY_TEMPLATE_CALLBACK_INVALID");
  return { ok: errors.length === 0, errors };
}
