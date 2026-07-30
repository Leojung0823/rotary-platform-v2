const APP_ENVIRONMENTS = new Set(["local", "staging", "production"]);
const LINE_LOGIN_MODES = new Set(["mock", "line"]);
const LINE_OA_MODES = new Set(["mock", "line"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function value(environment, name) {
  return String(environment[name] ?? "").trim();
}

function parseUrl(errors, name, rawValue, options = {}) {
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

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    errors.push(`${name}_INVALID`);
    return null;
  }
  if (options.originOnly && (parsed.pathname !== "/" || parsed.search || parsed.hash)) {
    errors.push(`${name}_ORIGIN_ONLY`);
  }
  if (options.httpsRequired && parsed.protocol !== "https:") {
    errors.push(`${name}_HTTPS_REQUIRED`);
  }
  if (options.publicHostRequired && LOCAL_HOSTS.has(parsed.hostname)) {
    errors.push(`${name}_PUBLIC_HOST_REQUIRED`);
  }
  return parsed;
}

function validateCredential(errors, environment, name, minimumLength = 20) {
  const credential = value(environment, name);
  if (!credential) {
    errors.push(`${name}_REQUIRED`);
  } else if (credential.length < minimumLength || /\s/u.test(credential)) {
    errors.push(`${name}_INVALID`);
  }
  return credential;
}

/**
 * Validate deployment configuration without returning any credential values.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 */
export function inspectDeploymentEnvironment(environment = process.env) {
  const errors = [];
  const warnings = [];
  const appEnvironment = value(environment, "APP_ENV");
  const isLocal = appEnvironment === "local";
  const isStaging = appEnvironment === "staging";
  const isProduction = appEnvironment === "production";
  const isHosted = isStaging || isProduction;

  if (!APP_ENVIRONMENTS.has(appEnvironment)) errors.push("APP_ENV_INVALID");

  const siteUrl = parseUrl(errors, "NEXT_PUBLIC_SITE_URL", value(environment, "NEXT_PUBLIC_SITE_URL"), {
    originOnly: true,
    httpsRequired: isHosted,
    publicHostRequired: isHosted,
  });
  const supabaseUrl = parseUrl(errors, "NEXT_PUBLIC_SUPABASE_URL", value(environment, "NEXT_PUBLIC_SUPABASE_URL"), {
    originOnly: true,
    httpsRequired: isHosted,
    publicHostRequired: isHosted,
  });

  const publishableKey = validateCredential(errors, environment, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = validateCredential(errors, environment, "SUPABASE_SERVICE_ROLE_KEY");
  if (publishableKey && serviceRoleKey && publishableKey === serviceRoleKey) {
    errors.push("SUPABASE_KEYS_MUST_DIFFER");
  }

  const trustedBoundary = value(environment, "TRUSTED_ADMIN_ENVIRONMENT");
  if (isHosted && trustedBoundary !== appEnvironment) {
    errors.push("TRUSTED_ADMIN_ENVIRONMENT_MISMATCH");
  }
  if (isLocal && trustedBoundary) warnings.push("LOCAL_TRUSTED_ADMIN_ENVIRONMENT_IGNORED");

  const lineLoginMode = value(environment, "LINE_LOGIN_MODE");
  if (!LINE_LOGIN_MODES.has(lineLoginMode)) errors.push("LINE_LOGIN_MODE_INVALID");
  if (isHosted && lineLoginMode !== "line") errors.push("HOSTED_LINE_LOGIN_MUST_USE_LINE");

  if (lineLoginMode === "mock") {
    validateCredential(errors, environment, "LINE_MOCK_SIGNING_SECRET", 32);
  }

  if (lineLoginMode === "line") {
    validateCredential(errors, environment, "LINE_LOGIN_CHANNEL_ID", 6);
    validateCredential(errors, environment, "LINE_LOGIN_CHANNEL_SECRET", 20);
    const callbackUrl = parseUrl(errors, "LINE_LOGIN_CALLBACK_URL", value(environment, "LINE_LOGIN_CALLBACK_URL"), {
      httpsRequired: isHosted,
      publicHostRequired: isHosted,
    });
    if (callbackUrl && siteUrl) {
      const expectedCallback = new URL("/api/auth/line/callback", siteUrl);
      if (callbackUrl.href !== expectedCallback.href) errors.push("LINE_LOGIN_CALLBACK_URL_MISMATCH");
    }
  }

  const lineOaMode = value(environment, "LINE_OA_MODE");
  if (!LINE_OA_MODES.has(lineOaMode)) errors.push("LINE_OA_MODE_INVALID");
  if (isStaging && lineOaMode === "mock") warnings.push("STAGING_LINE_OA_IS_MOCK");
  if (isProduction && lineOaMode !== "line") errors.push("PRODUCTION_LINE_OA_MUST_USE_LINE");

  if (isHosted && value(environment, "BOOTSTRAP_SUPERADMIN_PASSWORD")) {
    warnings.push("HOSTED_BOOTSTRAP_PASSWORD_REMOVE_AFTER_USE");
  }
  if (isHosted && value(environment, "VERIFY_OPERATOR_PASSWORD")) {
    warnings.push("HOSTED_VERIFY_OPERATOR_PASSWORD_LOCAL_ONLY");
  }

  return {
    ok: errors.length === 0,
    environment: appEnvironment || "unknown",
    hosted: isHosted,
    siteOrigin: siteUrl?.origin ?? null,
    supabaseOrigin: supabaseUrl?.origin ?? null,
    lineLoginMode: lineLoginMode || "unknown",
    lineOaMode: lineOaMode || "unknown",
    errors,
    warnings,
  };
}

export function assertDeploymentEnvironment(environment = process.env) {
  const report = inspectDeploymentEnvironment(environment);
  if (!report.ok) {
    throw new Error(`Deployment environment is invalid: ${report.errors.join(", ")}`);
  }
  return report;
}

export function isLocalHostname(hostname) {
  return LOCAL_HOSTS.has(hostname);
}
