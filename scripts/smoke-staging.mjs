#!/usr/bin/env node

import { isPublicHostname } from "../src/lib/public-hostname.mjs";

const rawBaseUrl = String(process.env.STAGING_BASE_URL ?? "").trim();
const expectedEnvironment = String(process.env.STAGING_EXPECT_ENV ?? "staging").trim();
const expectedSha = String(process.env.STAGING_EXPECTED_SHA ?? "").trim();

function fail(message) {
  console.error(`SMOKE FAILED: ${message}`);
  process.exit(1);
}

if (!rawBaseUrl) fail("STAGING_BASE_URL is required.");

let baseUrl;
try {
  baseUrl = new URL(rawBaseUrl);
} catch {
  fail("STAGING_BASE_URL is invalid.");
}

if (baseUrl.protocol !== "https:"
  || baseUrl.username
  || baseUrl.password
  || baseUrl.pathname !== "/"
  || baseUrl.search
  || baseUrl.hash) {
  fail("STAGING_BASE_URL must be a credential-free HTTPS origin.");
}
if (!isPublicHostname(baseUrl.hostname)) {
  fail("STAGING_BASE_URL must use a publicly routable hostname or IP address.");
}
if (expectedSha && !/^[a-f0-9]{40}$/u.test(expectedSha)) {
  fail("STAGING_EXPECTED_SHA must be an exact 40-character commit SHA when configured.");
}

async function request(path, options = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: options.redirect ?? "manual",
    signal: AbortSignal.timeout(15_000),
    headers: { "user-agent": "rotary-platform-staging-smoke/1.0" },
  });
  return response;
}

function requireSecurityHeaders(response, label) {
  if (response.headers.get("x-content-type-options") !== "nosniff") {
    fail(`${label} is missing X-Content-Type-Options.`);
  }
  if (response.headers.get("x-frame-options") !== "DENY") {
    fail(`${label} is missing X-Frame-Options.`);
  }
  if (response.headers.get("referrer-policy") !== "strict-origin-when-cross-origin") {
    fail(`${label} has an unexpected Referrer-Policy.`);
  }
  if (!String(response.headers.get("strict-transport-security") ?? "").includes("max-age=")) {
    fail(`${label} is missing Strict-Transport-Security.`);
  }
  if (!String(response.headers.get("x-robots-tag") ?? "").includes("noindex")) {
    fail(`${label} is missing staging noindex protection.`);
  }
}

try {
  const health = await request("/api/health");
  if (health.status !== 200) fail(`/api/health returned ${health.status}.`);
  const snapshot = await health.json();
  if (snapshot.status !== "ok") fail("Health snapshot is not ok.");
  if (expectedEnvironment && snapshot.environment !== expectedEnvironment) {
    fail(`Health environment is ${snapshot.environment}, expected ${expectedEnvironment}.`);
  }
  if (expectedSha && snapshot.revision !== expectedSha.slice(0, 12)) {
    fail("Health revision does not match the immutable staging commit.");
  }
  if (snapshot.checks?.configuration !== true) fail("Health configuration check did not pass.");
  if (snapshot.checks?.database !== true) fail("Health database check did not pass.");
  if (!Array.isArray(snapshot.issues) || snapshot.issues.length !== 0) {
    fail("Health snapshot contains public issues or omits the issues list.");
  }
  console.log("PASS health and database readiness");

  for (const path of ["/login", "/forgot-password", "/status", "/robots.txt"]) {
    const page = await request(path);
    if (page.status !== 200) fail(`${path} returned ${page.status}.`);
    requireSecurityHeaders(page, path);
    console.log(`PASS public page ${path}`);
  }

  const protectedPage = await request("/dashboard");
  if (![303, 307, 308].includes(protectedPage.status)) {
    fail(`/dashboard did not redirect an anonymous visitor; status ${protectedPage.status}.`);
  }
  const location = protectedPage.headers.get("location") ?? "";
  const redirectTarget = new URL(location, baseUrl);
  if (redirectTarget.origin !== baseUrl.origin || redirectTarget.pathname !== "/login") {
    fail("Anonymous dashboard redirect did not stay on the trusted login origin.");
  }
  console.log("PASS protected-route redirect");
  console.log("Staging smoke test passed. No credential values were printed.");
} catch (error) {
  fail(error instanceof Error ? error.message : "Unexpected smoke-test error.");
}
