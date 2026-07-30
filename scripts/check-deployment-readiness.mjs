#!/usr/bin/env node

import { inspectDeploymentReadiness } from "../src/lib/deployment-readiness.ts";

const result = inspectDeploymentReadiness(process.env);

console.log(`Deployment environment: ${result.environment}`);
console.log(`Site origin: ${result.summary.siteOrigin ?? "not configured"}`);
console.log(`Supabase host: ${result.summary.supabaseHost ?? "not configured"}`);
console.log(`LINE Login mode: ${result.summary.lineLoginMode ?? "not configured"}`);
console.log(`LINE OA mode: ${result.summary.lineOaMode ?? "not configured"}`);

for (const warning of result.warnings) console.warn(`WARNING ${warning}`);

if (!result.ready) {
  for (const error of result.errors) console.error(`ERROR ${error}`);
  console.error("Deployment readiness check failed. No secret values were printed.");
  process.exit(1);
}

console.log("Deployment readiness check passed. No secret values were printed.");
