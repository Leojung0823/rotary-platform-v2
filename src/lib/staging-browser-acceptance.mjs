import { isIP } from "node:net";

const LOCAL_HOSTS = new Set(["localhost", "localhost.localdomain"]);
const LOCAL_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home.arpa"];
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function text(value) {
  return String(value ?? "").trim();
}

function normalizeHostname(hostname) {
  const normalized = String(hostname ?? "").trim().toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

function isNonPublicIpv4(hostname) {
  const octets = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [first, second] = octets;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || first >= 224;
}

function isNonPublicIpv6(hostname) {
  if (hostname === "::" || hostname === "::1") return true;
  if (/^f[cd][0-9a-f]{2}:/u.test(hostname)) return true;
  if (/^fe[89ab][0-9a-f]:/u.test(hostname)) return true;

  const ipv4Mapped = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  return ipv4Mapped ? isNonPublicIpv4(ipv4Mapped) : false;
}

function isPublicHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  if (!normalized
    || LOCAL_HOSTS.has(normalized)
    || LOCAL_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return false;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return !isNonPublicIpv4(normalized);
  if (ipVersion === 6) return !isNonPublicIpv6(normalized);
  return true;
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
  if (!isPublicHostname(parsed.hostname)) errors.push("STAGING_BASE_URL_PUBLIC_HOST_REQUIRED");
  return parsed;
}

/**
 * Validate a protected, manually dispatched hosted-staging browser acceptance run
 * without returning the test account credentials.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function inspectStagingBrowserAcceptanceInput(input = process.env) {
  const errors = [];
  const eventName = text(input.GITHUB_EVENT_NAME);
  const refName = text(input.GITHUB_REF_NAME);
  const githubSha = text(input.GITHUB_SHA).toLowerCase();
  const expectedSha = text(input.STAGING_EXPECTED_SHA).toLowerCase();
  const confirmation = text(input.STAGING_ACCEPTANCE_CONFIRMATION);
  const siteUrl = validateHttpsOrigin(errors, text(input.STAGING_BASE_URL));
  const memberEmail = text(input.STAGING_TEST_MEMBER_EMAIL);
  const memberPassword = String(input.STAGING_TEST_MEMBER_PASSWORD ?? "");
  const expectedClubName = text(input.STAGING_EXPECTED_CLUB_NAME);

  if (eventName !== "workflow_dispatch") errors.push("STAGING_ACCEPTANCE_MANUAL_ONLY");
  if (refName !== "main") errors.push("STAGING_ACCEPTANCE_MAIN_ONLY");
  if (!COMMIT_SHA_PATTERN.test(githubSha)) errors.push("GITHUB_SHA_INVALID");
  if (!COMMIT_SHA_PATTERN.test(expectedSha)) errors.push("STAGING_EXPECTED_SHA_INVALID");
  else if (expectedSha !== githubSha) errors.push("STAGING_EXPECTED_SHA_MISMATCH");
  if (confirmation !== "TEST-STAGING") errors.push("STAGING_ACCEPTANCE_CONFIRMATION_MISMATCH");

  if (!EMAIL_PATTERN.test(memberEmail) || memberEmail.length > 320) {
    errors.push("STAGING_TEST_MEMBER_EMAIL_INVALID");
  }
  if (memberPassword.length < 12 || memberPassword.length > 256 || /[\r\n]/u.test(memberPassword)) {
    errors.push("STAGING_TEST_MEMBER_PASSWORD_INVALID");
  }
  if (!expectedClubName || expectedClubName.length > 160) {
    errors.push("STAGING_EXPECTED_CLUB_NAME_INVALID");
  }

  return {
    ok: errors.length === 0,
    eventName: eventName || "unknown",
    refName: refName || "unknown",
    commitSha: COMMIT_SHA_PATTERN.test(githubSha) ? githubSha : null,
    siteOrigin: siteUrl?.origin ?? null,
    credentialsConfigured: EMAIL_PATTERN.test(memberEmail) && memberPassword.length >= 12,
    expectedClubConfigured: Boolean(expectedClubName),
    errors,
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function assertStagingBrowserAcceptanceInput(input = process.env) {
  const result = inspectStagingBrowserAcceptanceInput(input);
  if (!result.ok) {
    throw new Error(`Staging browser acceptance input is invalid: ${result.errors.join(", ")}`);
  }
  return result;
}
