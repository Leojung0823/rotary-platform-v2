import { isPublicHostname } from "./public-hostname.mjs";

const PROJECT_REF_PATTERN = /^[a-z0-9]{16,32}$/u;
const CONNECTABLE_STATUSES = new Set(["ACTIVE", "ACTIVE_HEALTHY"]);

function text(value) {
  return String(value ?? "").trim();
}

function configuredProductionRefs(input) {
  return [
    text(input.PRODUCTION_SUPABASE_PROJECT_REF).toLowerCase(),
    ...text(input.PRODUCTION_SUPABASE_PROJECT_REFS).toLowerCase().split(/[\s,]+/u),
  ].filter(Boolean);
}

function configuredProductionHosts(input) {
  const hosts = [];
  for (const raw of [
    text(input.PRODUCTION_SUPABASE_URL),
    ...text(input.PRODUCTION_SUPABASE_URLS).split(/[\s,]+/u),
  ].filter(Boolean)) {
    try {
      hosts.push(new URL(raw).hostname.toLowerCase());
    } catch {
      hosts.push("__invalid_production_url__");
    }
  }
  return hosts;
}

/**
 * Validate the local inputs used before requesting Supabase project metadata.
 * No credential values are returned.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function inspectStagingProjectIdentityInput(input = process.env) {
  const errors = [];
  const projectRef = text(input.SUPABASE_PROJECT_REF);
  const accessToken = String(input.SUPABASE_ACCESS_TOKEN ?? "");
  const rawUrl = text(input.NEXT_PUBLIC_SUPABASE_URL ?? input.SUPABASE_URL);
  let parsed = null;

  if (text(input.APP_ENV) === "production") errors.push("PRODUCTION_PROJECT_FORBIDDEN");
  if (text(input.APP_ENV) !== "staging") errors.push("STAGING_APP_ENV_REQUIRED");
  if (text(input.TRUSTED_ADMIN_ENVIRONMENT) !== "staging") {
    errors.push("STAGING_TRUSTED_BOUNDARY_REQUIRED");
  }
  if (!PROJECT_REF_PATTERN.test(projectRef)) errors.push("SUPABASE_PROJECT_REF_INVALID");
  if (accessToken.length < 20 || /[\r\n]/u.test(accessToken)) {
    errors.push("SUPABASE_ACCESS_TOKEN_INVALID");
  }

  try {
    parsed = new URL(rawUrl);
  } catch {
    errors.push("STAGING_SUPABASE_URL_INVALID");
  }

  if (parsed) {
    if (parsed.protocol !== "https:" || parsed.username || parsed.password
      || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      errors.push("STAGING_SUPABASE_HTTPS_ORIGIN_REQUIRED");
    }
    if (!isPublicHostname(parsed.hostname)) errors.push("STAGING_SUPABASE_PUBLIC_HOST_REQUIRED");
    if (PROJECT_REF_PATTERN.test(projectRef)
      && parsed.hostname.toLowerCase() !== `${projectRef}.supabase.co`) {
      errors.push("STAGING_SUPABASE_HOST_REF_MISMATCH");
    }
  }

  const productionRefs = configuredProductionRefs(input);
  const productionHosts = configuredProductionHosts(input);
  if (productionRefs.length === 0 && productionHosts.length === 0) {
    errors.push("PRODUCTION_PROJECT_INVENTORY_REQUIRED");
  }
  if (productionRefs.some((ref) => !PROJECT_REF_PATTERN.test(ref))) {
    errors.push("PRODUCTION_PROJECT_IDENTIFIER_INVALID");
  }
  if (productionRefs.includes(projectRef)
    || (parsed && productionHosts.includes(parsed.hostname.toLowerCase()))) {
    errors.push("PRODUCTION_PROJECT_IDENTIFIER_MATCH");
  }
  if (productionHosts.includes("__invalid_production_url__")) {
    errors.push("PRODUCTION_PROJECT_IDENTIFIER_INVALID");
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Verify that the configured Hosted Supabase project is an active staging project.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 * @param {{fetchImpl?: typeof fetch}} options
 */
export async function verifyStagingProjectIdentity(input = process.env, options = {}) {
  const local = inspectStagingProjectIdentityInput(input);
  if (!local.ok) return local;

  const projectRef = text(input.SUPABASE_PROJECT_REF);
  const token = String(input.SUPABASE_ACCESS_TOKEN ?? "");
  const fetchImpl = options.fetchImpl ?? fetch;
  let response;
  let metadata;

  try {
    response = await fetchImpl(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}`, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ...local, ok: false, errors: ["PROJECT_METADATA_REQUEST_FAILED"] };
  }

  if (!response?.ok) {
    return { ...local, ok: false, errors: ["PROJECT_METADATA_REQUEST_FAILED"] };
  }
  try {
    metadata = await response.json();
  } catch {
    return { ...local, ok: false, errors: ["PROJECT_METADATA_INVALID"] };
  }

  const errors = [];
  const returnedRefs = [text(metadata?.ref), text(metadata?.id)].filter(Boolean);
  if (returnedRefs.length === 0 || returnedRefs.some((value) => value !== projectRef)) {
    errors.push("PROJECT_METADATA_REF_MISMATCH");
  }
  if (!/staging/iu.test(text(metadata?.name))) errors.push("PROJECT_NAME_NOT_STAGING");
  if (!CONNECTABLE_STATUSES.has(text(metadata?.status).toUpperCase())) {
    errors.push("PROJECT_STATUS_NOT_CONNECTABLE");
  }
  if (text(metadata?.database?.host).toLowerCase() !== `db.${projectRef}.supabase.co`) {
    errors.push("PROJECT_DATABASE_HOST_MISMATCH");
  }

  return {
    ok: errors.length === 0,
    projectConnectable: errors.length === 0,
    errors,
  };
}
