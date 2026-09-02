#!/usr/bin/env node

import { inspectStagingManagementAcceptanceInput } from "../src/lib/staging-management-acceptance.mjs";

const result = inspectStagingManagementAcceptanceInput(process.env);

console.log(`Staging management acceptance trigger: ${result.eventName}`);
console.log(`Git ref: ${result.refName}`);
console.log(`Commit SHA: ${result.commitSha ?? "invalid"}`);
console.log(`Site origin: ${result.siteOrigin ?? "not configured"}`);
console.log(`Protected operator credentials configured: ${result.credentialsConfigured ? "yes" : "no"}`);
console.log(`Expected club configured: ${result.expectedClubConfigured ? "yes" : "no"}`);

if (!result.ok) {
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.error("Staging management acceptance preflight failed. No credential value was printed.");
  process.exit(1);
}

console.log("Staging management acceptance preflight passed. No credential value was printed.");
