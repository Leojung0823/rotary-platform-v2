#!/usr/bin/env node

import { inspectDeploymentEnvironment } from "../src/lib/deployment-env.mjs";

const report = inspectDeploymentEnvironment(process.env);

console.log(`Deployment environment: ${report.environment}`);
console.log(`Site origin: ${report.siteOrigin ?? "not configured"}`);
console.log(`Supabase origin: ${report.supabaseOrigin ?? "not configured"}`);
console.log(`LINE Login mode: ${report.lineLoginMode}`);
console.log(`LINE OA mode: ${report.lineOaMode}`);

for (const warning of report.warnings) console.warn(`WARNING ${warning}`);

if (!report.ok) {
  for (const error of report.errors) console.error(`ERROR ${error}`);
  console.error("Deployment environment check failed. No credential values were printed.");
  process.exit(1);
}

console.log("Deployment environment check passed. No credential values were printed.");
