#!/usr/bin/env node

import {
  createSupabaseStagingProvisioningAdapter,
  inspectStagingProvisioningInput,
  provisionStagingTestData,
} from "../src/lib/staging-provisioning.mjs";

const preflightOnly = process.argv.includes("--preflight");
const inspection = inspectStagingProvisioningInput(process.env);

console.log(`Initial staging test-data provisioning enabled: ${inspection.enabled ? "yes" : "no"}`);
console.log(`Provisioning credentials configured: ${inspection.credentialsConfigured ? "yes" : "no"}`);

if (!inspection.ok || !inspection.enabled) {
  for (const error of inspection.errors) console.error(`ERROR ${error}`);
  console.error("Staging test-data provisioning preflight failed. No credential or identity value was printed.");
  process.exit(1);
}

if (preflightOnly) {
  console.log("Staging test-data provisioning preflight passed. No credential value was printed.");
  process.exit(0);
}

try {
  const adapter = createSupabaseStagingProvisioningAdapter({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const result = await provisionStagingTestData(process.env, adapter);
  console.log(result.idempotent
    ? "Staging test data already satisfied the protected acceptance contract."
    : "Staging test data was provisioned and verified for protected acceptance.");
  console.log("No Email, credential, Auth identifier, tenant identifier, or database identifier was printed.");
} catch (error) {
  const code = error?.name === "StagingProvisioningError" ? error.message : "STAGING_PROVISIONING_FAILED";
  console.error(`ERROR ${code}`);
  console.error("Staging test-data provisioning failed closed. No sensitive value was printed.");
  process.exit(1);
}
