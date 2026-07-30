#!/usr/bin/env node

import {
  inspectStagingHealth,
  parseStagingOrigin,
  readStagingHealth,
  requestStagingHealth,
} from "../src/lib/staging-revision.mjs";

const expectedSha = String(process.env.STAGING_EXPECTED_SHA ?? "").trim();

function boundedInteger(name, fallback, minimum, maximum) {
  const value = Number.parseInt(String(process.env[name] ?? fallback), 10);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    console.error(`REVISION WAIT FAILED: ${name} is outside its safe range.`);
    process.exit(1);
  }
  return value;
}

const requestTimeoutMs = boundedInteger("STAGING_REVISION_REQUEST_TIMEOUT_MS", 10_000, 1_000, 30_000);
const retryIntervalMs = boundedInteger("STAGING_REVISION_RETRY_INTERVAL_MS", 15_000, 1_000, 60_000);
const maximumWaitMs = boundedInteger("STAGING_REVISION_MAX_WAIT_MS", 360_000, 1_000, 1_800_000);

let origin;
try {
  origin = parseStagingOrigin(process.env.STAGING_BASE_URL);
} catch {
  console.error("REVISION WAIT FAILED: STAGING_BASE_URL must be a public, credential-free HTTPS origin.");
  process.exit(1);
}

if (!/^[a-f0-9]{40}$/u.test(expectedSha)) {
  console.error("REVISION WAIT FAILED: STAGING_EXPECTED_SHA must be an exact 40-character commit SHA.");
  process.exit(1);
}

const startedAt = Date.now();
const deadline = startedAt + maximumWaitMs;
let attempt = 0;

while (Date.now() < deadline) {
  attempt += 1;
  const remainingMs = deadline - Date.now();
  if (remainingMs < 1_000) break;
  try {
    const response = await requestStagingHealth(origin, {
      timeoutMs: Math.max(1_000, Math.min(requestTimeoutMs, remainingMs)),
    });
    const snapshot = await readStagingHealth(response);
    if (inspectStagingHealth(snapshot, expectedSha).ok) {
      console.log(`PASS staging revision ${expectedSha.slice(0, 12)} is healthy.`);
      process.exit(0);
    }
  } catch {
    // Deployment startup failures are expected during the bounded wait window.
  }

  console.log(`Staging revision not ready (attempt ${attempt}).`);
  const sleepMs = Math.min(retryIntervalMs, deadline - Date.now());
  if (sleepMs > 0) await new Promise((resolve) => setTimeout(resolve, sleepMs));
}

console.error(`REVISION WAIT FAILED: staging did not become healthy at revision ${expectedSha.slice(0, 12)} within the configured maximum wait.`);
process.exit(1);
