#!/usr/bin/env node

import {
  createSupabaseStagingNegativeRoleProvisioningAdapter,
  inspectStagingNegativeRoleProvisioningInput,
  provisionStagingNegativeRoleIdentities,
} from "../src/lib/staging-negative-role-provisioning.mjs";

const preflightOnly = process.argv.includes("--preflight");
const inspection = inspectStagingNegativeRoleProvisioningInput(process.env);

console.log(`Negative-role staging provisioning enabled: ${inspection.enabled ? "yes" : "no"}`);
console.log(`Negative-role test credentials configured: ${inspection.credentialsConfigured ? "yes" : "no"}`);

if (!inspection.ok || !inspection.enabled) {
  for (const error of inspection.errors) console.error(`ERROR ${error}`);
  console.error("Negative-role staging provisioning preflight failed. No credential or identity value was printed.");
  process.exit(1);
}

if (preflightOnly) {
  console.log("Negative-role staging provisioning preflight passed. No credential value was printed.");
  process.exit(0);
}

try {
  const adapter = createSupabaseStagingNegativeRoleProvisioningAdapter({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const result = await provisionStagingNegativeRoleIdentities(process.env, adapter);
  console.log(result.idempotent
    ? "Staging negative-role identities already satisfied the protected acceptance contract."
    : "Staging negative-role identities were provisioned and verified for protected acceptance.");
  console.log("No email, credential, Auth identifier, tenant identifier, or database identifier was printed.");
} catch (error) {
  const code = error?.name === "StagingNegativeRoleProvisioningError"
    ? error.message
    : "STAGING_NEGATIVE_ROLE_PROVISIONING_FAILED";
  console.error(`ERROR ${code}`);
  console.error("Negative-role staging provisioning failed closed. No sensitive value was printed.");
  process.exit(1);
}
