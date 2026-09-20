#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { compareStagingPerformanceResults } from "../src/lib/staging-performance-comparison.mjs";

const beforePath = String(process.env.STAGING_PERFORMANCE_BEFORE_OUTPUT ?? "").trim();
const afterPath = String(process.env.STAGING_PERFORMANCE_AFTER_OUTPUT ?? "").trim();

if (!beforePath || !afterPath) {
  console.error("Performance comparison output paths are required.");
  process.exit(1);
}

try {
  const [before, after] = await Promise.all([
    readFile(beforePath, "utf8").then(JSON.parse),
    readFile(afterPath, "utf8").then(JSON.parse),
  ]);
  const comparison = compareStagingPerformanceResults(before, after);
  console.log(`Before revision: ${comparison.beforeSha}`);
  console.log(`After revision: ${comparison.afterSha}`);
  console.log(`Browser cache condition: ${comparison.cacheMode}`);
  console.log("These are observational medians; a negative delta means the after revision was faster.");
  for (const route of comparison.routes) {
    console.log(`Route: ${route.label}`);
    for (const [metric, values] of Object.entries(route.metrics)) {
      const beforeMs = values.beforeMs == null ? "unmeasured" : values.beforeMs.toFixed(1);
      const afterMs = values.afterMs == null ? "unmeasured" : values.afterMs.toFixed(1);
      const deltaMs = values.deltaMs == null ? "unmeasured" : values.deltaMs.toFixed(1);
      const changePercent = values.changePercent == null ? "unmeasured" : `${values.changePercent.toFixed(1)}%`;
      console.log(`  ${metric}: before=${beforeMs} ms after=${afterMs} ms delta=${deltaMs} ms change=${changePercent}`);
    }
  }
} catch (error) {
  console.error(`Performance comparison failed: ${error instanceof Error ? error.message : "invalid result"}`);
  process.exit(1);
}
