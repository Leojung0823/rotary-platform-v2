import { readFile } from "node:fs/promises";
import {
  buildStagingRecoveryEmailPatch,
  buildStagingRedirectPatch,
  inspectStagingAuthConfigInput,
  inspectStagingRecoveryEmailConfig,
  inspectStagingRedirectConfig,
  isEmailTemplatePlanRestriction,
} from "../src/lib/staging-auth-config.mjs";

const apiBase = "https://api.supabase.com/v1";
const recoveryTemplatePath = new URL("../supabase/templates/recovery.html", import.meta.url);

function fail(message) {
  throw new Error(message);
}

/**
 * Diagnostics deliberately carry only the HTTP status code, the request method
 * and a static call label. The access token, the request body and the response
 * body are never placed into an error message or into stdout.
 */
/**
 * Surface just enough of a validation failure to locate the offending field.
 * Only 400/422 bodies are described, because those echo back the patch this
 * repository itself sent. Auth failures (401/403) are never described, and any
 * credential-shaped run is stripped before the text is truncated.
 */
function describeValidationFailure(status, responseText) {
  if (![400, 422].includes(status)) return "";
  const redacted = String(responseText)
    .replace(/sbp_[A-Za-z0-9_-]+/gu, "[redacted]")
    .replace(/ey[A-Za-z0-9_-]{20,}/gu, "[redacted]")
    .replace(/\s+/gu, " ")
    .trim();
  if (!redacted) return "";
  return `:detail=${redacted.slice(0, 300)}`;
}

async function send(path, { token, method = "GET", body, label = "unknown" } = {}) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (cause) {
    fail(`SUPABASE_MANAGEMENT_API_TRANSPORT_FAILED:${method}:${label}:${cause?.name ?? "Error"}`);
  }

  return { ok: response.ok, status: response.status, text: await response.text(), method, label };
}

/**
 * Perform a call that must succeed, returning its parsed body.
 */
async function request(path, options = {}) {
  const result = await send(path, options);
  if (!result.ok) {
    const detail = describeValidationFailure(result.status, result.text);
    fail(
      `SUPABASE_MANAGEMENT_API_REQUEST_FAILED:${result.method}:${result.label}`
      + `:HTTP_${result.status}${detail}`,
    );
  }
  if (!result.text) return {};
  try {
    return JSON.parse(result.text);
  } catch {
    fail("SUPABASE_MANAGEMENT_API_RESPONSE_INVALID");
  }
}

/**
 * Read-only status probe used only after a failure. Returns the HTTP status
 * and nothing else, so an unreadable token cannot leak through diagnostics.
 */
async function probeStatus(path, token) {
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    return `HTTP_${response.status}`;
  } catch (cause) {
    return `TRANSPORT_${cause?.name ?? "Error"}`;
  }
}

/**
 * Distinguish "this token is not accepted at all" from "this token is valid but
 * the account behind it cannot see the staging project". Prints statuses only.
 */
async function explainAccessFailure(token, projectRef) {
  const listStatus = await probeStatus("/projects", token);
  const projectStatus = await probeStatus(`/projects/${encodeURIComponent(projectRef)}`, token);
  console.error(
    `DIAGNOSTIC: GET /v1/projects -> ${listStatus}; `
    + `GET /v1/projects/{ref} -> ${projectStatus}. `
    + "HTTP_401 on both means the SUPABASE_ACCESS_TOKEN value is not a valid Supabase "
    + "personal access token. HTTP_200 on the list with HTTP_403 on the project means the "
    + "token is valid but its account is not a member of the organization that owns the "
    + "staging project, or lacks Administrator/Owner rights. No token or response body was read.",
  );
}

const local = inspectStagingAuthConfigInput(process.env);
if (!local.ok) fail(local.errors.join(","));

const projectRef = String(process.env.SUPABASE_PROJECT_REF).trim();
const token = String(process.env.SUPABASE_ACCESS_TOKEN).trim();
const recoveryTemplate = await readFile(recoveryTemplatePath, "utf8");

let project;
try {
  project = await request(`/projects/${encodeURIComponent(projectRef)}`, { token, label: "get_project" });
} catch (error) {
  await explainAccessFailure(token, projectRef);
  throw error;
}

if (String(project.ref ?? "").trim() !== projectRef
  || !/staging/iu.test(String(project.name ?? ""))
  || !["ACTIVE", "ACTIVE_HEALTHY"].includes(String(project.status ?? "").toUpperCase())) {
  fail("SUPABASE_PROJECT_IS_NOT_APPROVED_STAGING");
}

const authPath = `/projects/${encodeURIComponent(projectRef)}/config/auth`;
const current = await request(authPath, { token, label: "get_auth_config" });

// Stage 1: redirects. Accepted on every plan, and strictly enforced -- a
// staging deployment whose callback list is wrong is what this repair exists
// to prevent, so any failure here is fatal.
await request(authPath, {
  token,
  method: "PATCH",
  body: buildStagingRedirectPatch({ current }),
  label: "patch_redirects",
});
const afterRedirects = await request(authPath, { token, label: "verify_redirects" });
const redirectResult = inspectStagingRedirectConfig({ config: afterRedirects });
if (!redirectResult.ok) fail(redirectResult.errors.join(","));

// Stage 2: recovery email template. Supabase refuses these fields on a free
// tier project that still uses the default email provider. That refusal is a
// plan limitation, not a defect here, so it is reported loudly and the run is
// allowed to pass. Every other failure remains fatal.
const emailPatch = buildStagingRecoveryEmailPatch({ recoveryTemplate });
const emailResponse = await send(authPath, {
  token,
  method: "PATCH",
  body: emailPatch,
  label: "patch_recovery_email",
});

let recoveryEmailApplied = false;
if (emailResponse.ok) {
  const afterEmail = await request(authPath, { token, label: "verify_recovery_email" });
  const emailResult = inspectStagingRecoveryEmailConfig({ config: afterEmail, recoveryTemplate });
  if (!emailResult.ok) fail(emailResult.errors.join(","));
  recoveryEmailApplied = true;
} else if (isEmailTemplatePlanRestriction(emailResponse.status, emailResponse.text)) {
  console.warn(
    "BLOCKED_BY_PLAN: the staging project refused the recovery email template with "
    + `HTTP_${emailResponse.status}. Supabase does not allow email template modification `
    + "on a free tier project using the default email provider. Staging redirects were "
    + "still synced and verified. The recovery email therefore still uses the hosted "
    + "default template, so the prefetch-safe token_hash link is NOT active yet. "
    + "Configure a custom SMTP provider on the staging project to clear this.",
  );
} else {
  const detail = describeValidationFailure(emailResponse.status, emailResponse.text);
  fail(
    `SUPABASE_MANAGEMENT_API_REQUEST_FAILED:${emailResponse.method}:${emailResponse.label}`
    + `:HTTP_${emailResponse.status}${detail}`,
  );
}

console.log(
  "Staging Supabase Auth redirects are configured and verified. Recovery email template: "
  + `${recoveryEmailApplied ? "configured and verified" : "BLOCKED_BY_PLAN (see warning above)"}. `
  + "Values were not printed.",
);
