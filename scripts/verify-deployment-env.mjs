#!/usr/bin/env node
import { inspectDeploymentEnvironment } from "../src/lib/deployment-env.mjs";

const report = inspectDeploymentEnvironment(process.env);
const label = report.environment.toUpperCase();

console.log(`Deployment preflight: ${label}`);
console.log(`Configuration: ${report.ok ? "READY" : "BLOCKED"}`);
console.log(`LINE Login mode: ${report.lineLoginMode}`);
console.log(`LINE OA mode: ${report.lineOaMode}`);

for (const warning of report.warnings) console.warn(`WARNING ${warning}`);
for (const error of report.errors) console.error(`ERROR ${error}`);

if (!report.ok) {
  console.error("No credential values were printed. Fix the named environment variables and run the check again.");
  process.exitCode = 1;
}
