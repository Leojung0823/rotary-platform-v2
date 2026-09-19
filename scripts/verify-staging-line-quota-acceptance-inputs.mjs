#!/usr/bin/env node

import { inspectStagingLineQuotaAcceptanceInput } from "../src/lib/staging-line-quota-acceptance.mjs";

const result = inspectStagingLineQuotaAcceptanceInput(process.env);

console.log(`Staging LINE quota acceptance trigger: ${result.eventName}`);
console.log(`Git ref: ${result.refName}`);
console.log(`Commit SHA: ${result.commitSha ?? "invalid"}`);
console.log(`Site origin: ${result.siteOrigin ?? "not configured"}`);
console.log(`Protected test credentials configured: ${result.credentialsConfigured ? "yes" : "no"}`);
console.log(`Expected test club configured: ${result.expectedClubConfigured ? "yes" : "no"}`);
console.log(`Synthetic fixture id: ${result.fixtureId ?? "invalid"}`);

if (!result.ok) {
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.error("Staging LINE quota acceptance preflight failed. No credential value was printed.");
  process.exit(1);
}

console.log("Staging LINE quota acceptance preflight passed. No credential value was printed.");
