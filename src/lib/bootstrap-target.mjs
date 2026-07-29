const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Bootstrap is automatic locally, explicitly confirmable on staging, and forbidden on production.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment
 */
export function inspectBootstrapTarget(environment = process.env) {
  const errors = [];
  const rawUrl = String(environment.NEXT_PUBLIC_SUPABASE_URL ?? environment.SUPABASE_URL ?? "").trim();
  let parsed = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    errors.push("SUPABASE_URL_INVALID");
  }

  if (!parsed) return { ok: false, target: "unknown", hostname: null, errors };
  const local = LOCAL_HOSTS.has(parsed.hostname);
  if (local) return { ok: true, target: "local", hostname: parsed.hostname, errors };

  if (environment.APP_ENV === "production") errors.push("PRODUCTION_BOOTSTRAP_FORBIDDEN");
  if (environment.APP_ENV !== "staging") errors.push("STAGING_APP_ENV_REQUIRED");
  if (environment.TRUSTED_ADMIN_ENVIRONMENT !== "staging") errors.push("STAGING_TRUSTED_BOUNDARY_REQUIRED");
  if (parsed.protocol !== "https:") errors.push("STAGING_SUPABASE_HTTPS_REQUIRED");
  if (environment.BOOTSTRAP_CONFIRM_SUPABASE_HOST !== parsed.hostname) {
    errors.push("BOOTSTRAP_HOST_CONFIRMATION_MISMATCH");
  }

  return {
    ok: errors.length === 0,
    target: "staging",
    hostname: parsed.hostname,
    errors,
  };
}
