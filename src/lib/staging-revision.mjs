import { hostnameResolvesPublicly, isPublicHostname } from "./public-hostname.mjs";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;

export class StagingRevisionError extends Error {
  constructor(code) {
    super(code);
    this.name = "StagingRevisionError";
    this.code = code;
  }
}

export function parseStagingOrigin(rawValue) {
  let origin;
  try {
    origin = new URL(String(rawValue ?? "").trim());
  } catch {
    throw new StagingRevisionError("STAGING_BASE_URL_INVALID");
  }

  if (origin.protocol !== "https:"
    || origin.username
    || origin.password
    || origin.pathname !== "/"
    || origin.search
    || origin.hash
    || !isPublicHostname(origin.hostname)) {
    throw new StagingRevisionError("STAGING_BASE_URL_UNSAFE");
  }
  return origin;
}

export function inspectStagingHealth(snapshot, expectedSha) {
  const normalizedSha = String(expectedSha ?? "").trim();
  if (!COMMIT_SHA_PATTERN.test(normalizedSha)) {
    return { ok: false, errors: ["STAGING_EXPECTED_SHA_INVALID"] };
  }

  const errors = [];
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ok: false, errors: ["HEALTH_RESPONSE_INVALID"] };
  }
  if (snapshot.status !== "ok") errors.push("HEALTH_STATUS_NOT_OK");
  if (snapshot.environment !== "staging") errors.push("HEALTH_ENVIRONMENT_MISMATCH");
  if (snapshot.revision !== normalizedSha.slice(0, 12)) errors.push("HEALTH_REVISION_MISMATCH");
  if (snapshot.checks?.configuration !== true) errors.push("HEALTH_CONFIGURATION_FAILED");
  if (snapshot.checks?.database !== true) errors.push("HEALTH_DATABASE_FAILED");
  if (!Array.isArray(snapshot.issues) || snapshot.issues.length !== 0) {
    errors.push("HEALTH_PUBLIC_ISSUES_PRESENT");
  }
  return { ok: errors.length === 0, errors };
}

export async function requestStagingHealth(origin, options = {}) {
  const trustedOrigin = parseStagingOrigin(origin instanceof URL ? origin.href : origin);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Number(options.timeoutMs ?? 10_000);
  const maxRedirects = Number(options.maxRedirects ?? 5);
  const lookupImpl = options.lookupImpl;

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new StagingRevisionError("STAGING_REQUEST_TIMEOUT_INVALID");
  }
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 5) {
    throw new StagingRevisionError("STAGING_REDIRECT_LIMIT_INVALID");
  }

  let target = new URL("/api/health", trustedOrigin);
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (!await hostnameResolvesPublicly(target.hostname, lookupImpl)) {
      throw new StagingRevisionError("STAGING_HEALTH_DNS_UNSAFE");
    }
    let response;
    try {
      response = await fetchImpl(target, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: "application/json",
          "cache-control": "no-cache",
          "user-agent": "rotary-platform-staging-revision-wait/1.0",
        },
      });
    } catch {
      throw new StagingRevisionError("STAGING_HEALTH_REQUEST_FAILED");
    }

    if (!REDIRECT_STATUSES.has(response.status)) return response;
    if (redirects === maxRedirects) throw new StagingRevisionError("STAGING_REDIRECT_LIMIT_EXCEEDED");

    const location = response.headers.get("location");
    if (!location) throw new StagingRevisionError("STAGING_REDIRECT_LOCATION_MISSING");
    let redirected;
    try {
      redirected = new URL(location, target);
    } catch {
      throw new StagingRevisionError("STAGING_REDIRECT_LOCATION_INVALID");
    }
    if (redirected.origin !== trustedOrigin.origin || redirected.username || redirected.password) {
      throw new StagingRevisionError("STAGING_REDIRECT_ORIGIN_MISMATCH");
    }
    target = redirected;
  }

  throw new StagingRevisionError("STAGING_REDIRECT_LIMIT_EXCEEDED");
}

export async function readStagingHealth(response, maximumBytes = 65_536) {
  if (response.status !== 200) throw new StagingRevisionError("STAGING_HEALTH_HTTP_NOT_OK");
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new StagingRevisionError("STAGING_HEALTH_RESPONSE_TOO_LARGE");
  }
  let body;
  try {
    body = await response.text();
  } catch {
    throw new StagingRevisionError("STAGING_HEALTH_RESPONSE_UNREADABLE");
  }
  if (Buffer.byteLength(body, "utf8") > maximumBytes) {
    throw new StagingRevisionError("STAGING_HEALTH_RESPONSE_TOO_LARGE");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new StagingRevisionError("STAGING_HEALTH_RESPONSE_INVALID");
  }
}
