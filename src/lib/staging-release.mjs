const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const PROJECT_REF_PATTERN = /^[a-z0-9]{16,32}$/u;

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

export function inspectStagingReleaseInput(input = process.env) {
  const errors = [];
  const refName = text(input.GITHUB_REF_NAME);
  const confirmation = text(input.STAGING_CONFIRMATION);
  const operation = text(input.STAGING_OPERATION || "plan");
  const projectRef = text(input.SUPABASE_PROJECT_REF);
  const siteUrl = validateHttpsOrigin(errors, text(input.STAGING_BASE_URL));

  if (refName !== "main") errors.push("STAGING_RELEASE_MAIN_ONLY");
  if (!new Set(["plan", "apply"]).has(operation)) errors.push("STAGING_OPERATION_INVALID");
  if (!PROJECT_REF_PATTERN.test(projectRef)) errors.push("SUPABASE_PROJECT_REF_INVALID");
  if (operation === "apply" && confirmation !== "DEPLOY-STAGING") {
    errors.push("STAGING_CONFIRMATION_MISMATCH");
  }

  return {
    ok: errors.length === 0,
    operation,
    refName: refName || "unknown",
    siteOrigin: siteUrl?.origin ?? null,
    projectRefSuffix: PROJECT_REF_PATTERN.test(projectRef) ? projectRef.slice(-4) : null,
    errors,
  };
}

export function assertStagingReleaseInput(input = process.env) {
  const result = inspectStagingReleaseInput(input);
  if (!result.ok) throw new Error(`Staging release input is invalid: ${result.errors.join(", ")}`);
  return result;
}
