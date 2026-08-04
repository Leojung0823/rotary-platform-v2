#!/usr/bin/env node

import {
  StagingDeployHookError,
  triggerStagingDeployment,
} from "../src/lib/staging-deploy-hook.mjs";

try {
  const result = await triggerStagingDeployment(process.env.STAGING_DEPLOY_HOOK, {
    commitSha: process.env.STAGING_EXPECTED_SHA,
  });
  console.log(`Staging deployment hook accepted the exact approved revision with HTTP ${result.status}.`);
  console.log("The hook value and commit ref were not printed; deployment readiness is not implied by hook acceptance.");
} catch (error) {
  const code = error instanceof StagingDeployHookError
    ? error.code
    : "STAGING_DEPLOY_HOOK_REQUEST_FAILED";
  console.error(`ERROR ${code}`);
  console.error("Staging deployment hook failed. The hook value and commit ref were not printed.");
  process.exit(1);
}
