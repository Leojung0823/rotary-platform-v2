import { appendFile, readFile, unlink } from "node:fs/promises";
import {
  formatStagingDashboardTimings,
  parseStagingDashboardTimings,
} from "../src/lib/staging-performance-telemetry.mjs";

const outputPath = process.env.STAGING_DASHBOARD_TELEMETRY_OUTPUT;
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (!outputPath || !summaryPath) {
  console.error("Staging dashboard telemetry summary configuration is incomplete.");
  process.exit(1);
}

let timings = null;
try {
  timings = parseStagingDashboardTimings(await readFile(outputPath, "utf8"));
} catch {
  // Raw database query output must never be printed to job logs.
} finally {
  await unlink(outputPath).catch(() => {});
}

await appendFile(summaryPath, `${formatStagingDashboardTimings(timings)}\n`);
console.log("Only validated aggregate timings were added to the job summary; raw query output was discarded.");
