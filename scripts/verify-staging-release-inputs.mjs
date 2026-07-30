#!/usr/bin/env node

import { inspectStagingReleaseInput } from "../src/lib/staging-release.mjs";

const result = inspectStagingReleaseInput(process.env);

console.log(`Staging release operation: ${result.operation}`);
console.log(`Git ref: ${result.refName}`);
console.log(`Site origin: ${result.siteOrigin ?? "not configured"}`);
console.log(`Supabase project suffix: ${result.projectRefSuffix ?? "invalid"}`);

if (!result.ok) {
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.error("Staging release preflight failed. No access token, database password, or credential value was printed.");
  process.exit(1);
}

console.log("Staging release preflight passed. No credential values were printed.");
