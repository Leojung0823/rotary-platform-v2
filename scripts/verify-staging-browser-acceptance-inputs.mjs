#!/usr/bin/env node

import { inspectStagingBrowserAcceptanceInput } from "../src/lib/staging-browser-acceptance.mjs";

const result = inspectStagingBrowserAcceptanceInput(process.env);

console.log(`Staging acceptance trigger: ${result.eventName}`);
console.log(`Git ref: ${result.refName}`);
console.log(`Commit SHA: ${result.commitSha ?? "invalid"}`);
console.log(`Site origin: ${result.siteOrigin ?? "not configured"}`);
console.log(`Test credentials configured: ${result.credentialsConfigured ? "yes" : "no"}`);
console.log(`Expected club configured: ${result.expectedClubConfigured ? "yes" : "no"}`);

if (!result.ok) {
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.error("Staging browser acceptance preflight failed. No email address, password, or credential value was printed.");
  process.exit(1);
}

console.log("Staging browser acceptance preflight passed. No credential values were printed.");
