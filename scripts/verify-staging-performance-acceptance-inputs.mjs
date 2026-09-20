#!/usr/bin/env node

import { inspectStagingPerformanceAcceptanceInput } from "../src/lib/staging-performance-acceptance.mjs";

const result = inspectStagingPerformanceAcceptanceInput(process.env);

console.log(`Staging performance trigger: ${result.eventName}`);
console.log(`Git ref: ${result.refName}`);
console.log(`Workflow SHA: ${result.workflowSha ?? "invalid"}`);
console.log(`Expected staging SHA: ${result.expectedSha ?? "invalid"}`);
console.log(`Site origin: ${result.siteOrigin ?? "not configured"}`);
console.log(`Test credentials configured: ${result.credentialsConfigured ? "yes" : "no"}`);
console.log(`Expected club configured: ${result.expectedClubConfigured ? "yes" : "no"}`);
console.log(`Sample count: ${result.sampleCount ?? "invalid"}`);

if (!result.ok) {
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.error("Staging performance acceptance preflight failed. No email address, password, or credential value was printed.");
  process.exit(1);
}

console.log("Staging performance acceptance preflight passed. No credential values were printed.");
