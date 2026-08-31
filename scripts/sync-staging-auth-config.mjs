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

async function request(path, { token, method = "GET", body } = {}) {
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
  } catch {
    fail("SUPABASE_MANAGEMENT_API_REQUEST_FAILED");
  }

  const responseText = await response.text();
  if (!response.ok) fail("SUPABASE_MANAGEMENT_API_REQUEST_FAILED");
  if (!responseText) return {};
  try {
    return JSON.parse(responseText);
  } catch {
    fail("SUPABASE_MANAGEMENT_API_RESPONSE_INVALID");
  }
}

const local = inspectStagingAuthConfigInput(process.env);
if (!local.ok) fail(local.errors.join(","));

const projectRef = String(process.env.SUPABASE_PROJECT_REF).trim();
const token = String(process.env.SUPABASE_ACCESS_TOKEN);
const recoveryTemplate = await readFile(recoveryTemplatePath, "utf8");
const project = await request(`/projects/${encodeURIComponent(projectRef)}`, { token });

if (String(project.ref ?? "").trim() !== projectRef
  || !/staging/iu.test(String(project.name ?? ""))
  || !["ACTIVE", "ACTIVE_HEALTHY"].includes(String(project.status ?? "").toUpperCase())) {
  fail("SUPABASE_PROJECT_IS_NOT_APPROVED_STAGING");
}

const authPath = `/projects/${encodeURIComponent(projectRef)}/config/auth`;
const current = await request(authPath, { token });
const patch = buildStagingAuthConfigPatch({ current, recoveryTemplate });
await request(authPath, { token, method: "PATCH", body: patch });
const verified = await request(authPath, { token });
const result = inspectStagingAuthConfig({ config: verified, recoveryTemplate });
if (!result.ok) fail(result.errors.join(","));

console.log("Staging Supabase Auth redirects and recovery email template are configured. Values were not printed.");
