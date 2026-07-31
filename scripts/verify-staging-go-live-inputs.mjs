#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import { inspectStagingGoLiveInput } from "../src/lib/staging-go-live.mjs";

const result = inspectStagingGoLiveInput(process.env);

console.log(`Staging go-live trigger: ${result.eventName}`);
console.log(`Git ref: ${result.refName}`);
console.log(`Commit SHA: ${result.commitSha ?? "invalid"}`);
console.log(`Plan run id: ${result.planRunId ?? "invalid"}`);
console.log(`Site origin: ${result.siteOrigin ?? "not configured"}`);
console.log(`Project suffix: ${result.projectRefSuffix ?? "invalid"}`);
console.log(`Deployment hook configured: ${result.deploymentHookConfigured ? "yes" : "no"}`);
console.log(`Protected credentials configured: ${result.credentialsConfigured ? "yes" : "no"}`);
console.log(`Expected club configured: ${result.expectedClubConfigured ? "yes" : "no"}`);
console.log(`Initial test-data provisioning enabled: ${result.provisioningEnabled ? "yes" : "no"}`);

if (!result.ok) {
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.error("Staging go-live preflight failed. No credential or deployment-hook value was printed.");
  process.exit(1);
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, "sha_verified=true\n", { encoding: "utf8" });
}
console.log("Staging go-live preflight passed. No credential or deployment-hook value was printed.");
