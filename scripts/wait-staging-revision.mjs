#!/usr/bin/env node

import { isPublicHostname } from "../src/lib/public-hostname.mjs";

const rawBaseUrl = String(process.env.STAGING_BASE_URL ?? "").trim();
const expectedSha = String(process.env.STAGING_EXPECTED_SHA ?? "").trim().toLowerCase();
const attempts = Number.parseInt(String(process.env.STAGING_REVISION_ATTEMPTS ?? "24"), 10);
const delayMs = Number.parseInt(String(process.env.STAGING_REVISION_DELAY_MS ?? "15000"), 10);

function fail(message) {
  console.error(`REVISION WAIT FAILED: ${message}`);
  process.exit(1);
}

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
  || baseUrl.hash
  || !isPublicHostname(baseUrl.hostname)) {
  fail("STAGING_BASE_URL must be a public, credential-free HTTPS origin.");
}
if (!/^[a-f0-9]{40}$/u.test(expectedSha)) {
  fail("STAGING_EXPECTED_SHA must be an exact 40-character commit SHA.");
}
if (!Number.isInteger(attempts) || attempts < 1 || attempts > 60) {
  fail("STAGING_REVISION_ATTEMPTS must be between 1 and 60.");
}
if (!Number.isInteger(delayMs) || delayMs < 1000 || delayMs > 60000) {
  fail("STAGING_REVISION_DELAY_MS must be between 1000 and 60000.");
}

const expectedRevision = expectedSha.slice(0, 12);

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(new URL("/api/health", baseUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "cache-control": "no-cache",
        "user-agent": "rotary-platform-staging-revision-wait/1.0",
      },
    });
    if (response.status === 200) {
      const snapshot = await response.json();
      if (snapshot.status === "ok"
        && snapshot.environment === "staging"
        && snapshot.revision === expectedRevision
        && snapshot.checks?.configuration === true
        && snapshot.checks?.database === true) {
        console.log(`PASS staging revision ${expectedRevision} is healthy.`);
        process.exit(0);
      }
    }
  } catch {
    // The deployment may still be starting. Retry without exposing response content.
  }

  console.log(`Staging revision not ready (${attempt}/${attempts}).`);
  if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
}

fail(`staging did not become healthy at revision ${expectedRevision}.`);
