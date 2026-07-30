export type AppEnvironment = "local" | "staging" | "production";

type EnvironmentInput = Record<string, string | undefined>;

export type DeploymentReadiness = {
  ready: boolean;
  environment: AppEnvironment | "invalid";
  errors: string[];
  warnings: string[];
  summary: {
    siteOrigin: string | null;
    supabaseHost: string | null;
    lineLoginMode: string | null;
    lineOaMode: string | null;
  };
};

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const validEnvironments = new Set<AppEnvironment>(["local", "staging", "production"]);

function value(input: EnvironmentInput, name: string) {
  return input[name]?.trim() ?? "";
}

function parseBaseUrl(
  raw: string,
  name: string,
  errors: string[],
  options: { hosted: boolean; requireRoot: boolean },
) {
  if (!raw) {
    errors.push(`${name}_required`);
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    errors.push(`${name}_invalid`);
    return null;
  }

  if (!["http:", "https:"].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (options.requireRoot && parsed.pathname !== "/")) {
    errors.push(`${name}_invalid`);
    return null;
  }

  if (options.hosted && parsed.protocol !== "https:") errors.push(`${name}_https_required`);
  if (options.hosted && localHosts.has(parsed.hostname)) errors.push(`${name}_hosted_origin_required`);
  return parsed;
}

function requireSecret(input: EnvironmentInput, name: string, errors: string[], minimumLength = 20) {
  const secret = value(input, name);
  if (!secret) errors.push(`${name}_required`);
  else if (secret.length < minimumLength || /\s/u.test(secret)) errors.push(`${name}_invalid`);
  return secret;
}

export function inspectDeploymentReadiness(input: EnvironmentInput = process.env): DeploymentReadiness {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rawEnvironment = value(input, "APP_ENV");
  const environment = validEnvironments.has(rawEnvironment as AppEnvironment)
    ? rawEnvironment as AppEnvironment
    : "invalid";
  if (environment === "invalid") errors.push("APP_ENV_invalid");

  const hosted = environment === "staging" || environment === "production";
  const siteUrl = parseBaseUrl(value(input, "NEXT_PUBLIC_SITE_URL"), "NEXT_PUBLIC_SITE_URL", errors, {
    hosted,
    requireRoot: true,
  });
  const supabaseUrl = parseBaseUrl(value(input, "NEXT_PUBLIC_SUPABASE_URL"), "NEXT_PUBLIC_SUPABASE_URL", errors, {
    hosted,
    requireRoot: true,
  });

  const publishableKey = requireSecret(input, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", errors);
  const serviceRoleKey = requireSecret(input, "SUPABASE_SERVICE_ROLE_KEY", errors);
  if (publishableKey && serviceRoleKey && publishableKey === serviceRoleKey) {
    errors.push("SUPABASE_KEYS_must_differ");
  }

  if (hosted && value(input, "TRUSTED_ADMIN_ENVIRONMENT") !== environment) {
    errors.push("TRUSTED_ADMIN_ENVIRONMENT_mismatch");
  }

  const lineLoginMode = value(input, "LINE_LOGIN_MODE");
  if (!new Set(["mock", "line"]).has(lineLoginMode)) errors.push("LINE_LOGIN_MODE_invalid");
  if (environment === "production" && lineLoginMode !== "line") errors.push("LINE_LOGIN_MODE_production_requires_line");
  if (environment === "staging" && lineLoginMode === "mock") warnings.push("LINE_LOGIN_MODE_staging_mock_only");

  if (lineLoginMode === "mock") {
    requireSecret(input, "LINE_MOCK_SIGNING_SECRET", errors, 32);
  }

  if (lineLoginMode === "line") {
    requireSecret(input, "LINE_LOGIN_CHANNEL_ID", errors, 6);
    requireSecret(input, "LINE_LOGIN_CHANNEL_SECRET", errors, 20);
    const callback = parseBaseUrl(value(input, "LINE_LOGIN_CALLBACK_URL"), "LINE_LOGIN_CALLBACK_URL", errors, {
      hosted,
      requireRoot: false,
    });
    if (callback && siteUrl) {
      const expected = new URL("/api/auth/line/callback", siteUrl);
      if (callback.toString() !== expected.toString()) errors.push("LINE_LOGIN_CALLBACK_URL_mismatch");
    }
  }

  const lineOaMode = value(input, "LINE_OA_MODE");
  if (!new Set(["mock", "line"]).has(lineOaMode)) errors.push("LINE_OA_MODE_invalid");
  if (environment === "production" && lineOaMode !== "line") errors.push("LINE_OA_MODE_production_requires_line");
  if (environment === "staging" && lineOaMode === "mock") warnings.push("LINE_OA_MODE_staging_mock_only");

  if (hosted && value(input, "BOOTSTRAP_SUPERADMIN_PASSWORD")) {
    warnings.push("BOOTSTRAP_SUPERADMIN_PASSWORD_remove_after_bootstrap");
  }
  if (hosted && value(input, "VERIFY_OPERATOR_PASSWORD")) {
    warnings.push("VERIFY_OPERATOR_PASSWORD_local_only");
  }

  return {
    ready: errors.length === 0,
    environment,
    errors,
    warnings,
    summary: {
      siteOrigin: siteUrl?.origin ?? null,
      supabaseHost: supabaseUrl?.hostname ?? null,
      lineLoginMode: lineLoginMode || null,
      lineOaMode: lineOaMode || null,
    },
  };
}
