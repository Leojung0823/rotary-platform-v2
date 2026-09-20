#!/usr/bin/env node

import { inspectStagingPerformanceComparisonInput } from "../src/lib/staging-performance-comparison.mjs";

const result = inspectStagingPerformanceComparisonInput(process.env);

console.log(`Comparison trigger: ${result.eventName}`);
console.log(`Git ref: ${result.refName}`);
console.log(`Workflow SHA: ${result.workflowSha ?? "invalid"}`);
console.log(`Baseline SHA: ${result.baselineSha ?? "invalid"}`);
console.log(`Restore SHA: ${result.restoreSha ?? "invalid"}`);
console.log(`Site origin: ${result.siteOrigin ?? "not configured"}`);
console.log(`Test credentials configured: ${result.credentialsConfigured ? "yes" : "no"}`);
console.log(`Expected club configured: ${result.expectedClubConfigured ? "yes" : "no"}`);
console.log(`Sample count: ${result.sampleCount ?? "invalid"}`);
console.log(`Browser cache condition: ${result.cacheMode ?? "invalid"}`);

if (!result.ok) {
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.error("Staging performance comparison preflight failed. No email address, password, or credential value was printed.");
  process.exit(1);
}

console.log("Staging performance comparison preflight passed. No credential values were printed.");
