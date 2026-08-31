import { readFile } from "node:fs/promises";
import {
  buildStagingAuthConfigPatch,
  inspectStagingAuthConfig,
  inspectStagingAuthConfigInput,
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
async function request(path, { token, method = "GET", body, label = "unknown" } = {}) {
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

  const responseText = await response.text();
  if (!response.ok) {
    fail(`SUPABASE_MANAGEMENT_API_REQUEST_FAILED:${method}:${label}:HTTP_${response.status}`);
  }
  if (!responseText) return {};
  try {
    return JSON.parse(responseText);
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
const patch = buildStagingAuthConfigPatch({ current, recoveryTemplate });
await request(authPath, { token, method: "PATCH", body: patch, label: "patch_auth_config" });
const verified = await request(authPath, { token, label: "verify_auth_config" });
const result = inspectStagingAuthConfig({ config: verified, recoveryTemplate });
if (!result.ok) fail(result.errors.join(","));

console.log("Staging Supabase Auth redirects and recovery email template are configured. Values were not printed.");
