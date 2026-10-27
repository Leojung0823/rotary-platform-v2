/** @typedef {"member_context_resolve_success" | "member_home_projection_duration"} EventName */

/** @typedef {Readonly<{
 *   eventName: EventName,
 *   sampleCount: number,
 *   medianDurationMs: number,
 *   p95DurationMs: number,
 * }>} StagingDashboardTiming */

/** @type {Readonly<Record<EventName, string>>} */
const eventLabels = Object.freeze({
  member_context_resolve_success: "社團／模式情境解析",
  member_home_projection_duration: "社員首頁資料投影",
});

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @param {{integer?: boolean}} [options] @returns {number | null} */
function boundedNumber(value, { integer = false } = {}) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 120_000 || (integer && !Number.isInteger(parsed))) return null;
  return parsed;
}

/** @param {string} output @returns {unknown} */
function extractJsonObject(output) {
  const objectStart = output.indexOf("{");
  if (objectStart < 0) return null;
  try {
    return JSON.parse(output.slice(objectStart));
  } catch {
    return null;
  }
}

/** Accept only the fixed, aggregate columns returned by staging-dashboard-telemetry.sql.
 * @param {string} output
 * @returns {readonly StagingDashboardTiming[] | null}
 */
export function parseStagingDashboardTimings(output) {
  const result = extractJsonObject(output);
  if (!isRecord(result) || !Array.isArray(result.rows) || result.rows.length > 2) return null;

  const timings = [];
  for (const row of result.rows) {
    if (!isRecord(row)) return null;
    const expectedKeys = ["event_name", "sample_count", "median_duration_ms", "p95_duration_ms"].sort();
    const actualKeys = Object.keys(row).sort();
    if (actualKeys.length !== expectedKeys.length
      || !expectedKeys.every((key, index) => key === actualKeys[index])) return null;
    if (typeof row.event_name !== "string" || !Object.hasOwn(eventLabels, row.event_name)) return null;

    const sampleCount = boundedNumber(row.sample_count, { integer: true });
    const medianDurationMs = boundedNumber(row.median_duration_ms);
    const p95DurationMs = boundedNumber(row.p95_duration_ms);
    if (sampleCount === null || sampleCount < 1
      || medianDurationMs === null || p95DurationMs === null
      || p95DurationMs < medianDurationMs) return null;

    timings.push({
      eventName: row.event_name,
      sampleCount,
      medianDurationMs,
      p95DurationMs,
    });
  }
  return timings;
}

/** @param {readonly StagingDashboardTiming[] | null} timings @returns {string} */
export function formatStagingDashboardTimings(timings) {
  const heading = [
    "### Staging dashboard server-side timings (read-only aggregate)",
    "- Window: trailing 15 minutes at query time. This is a staging-wide aggregate, not tied to a person or a single browser sample.",
    "- Only event name, sample count, median, and P95 are included; no identifiers, payloads, or page content are queried.",
  ];
  if (timings === null) return `${heading.join("\n")}\n- Result could not be safely parsed; raw query output was discarded.\n`;
  if (timings.length === 0) return `${heading.join("\n")}\n- No usable telemetry samples were found in this window.\n`;

  const rows = timings.map((timing) => `| ${eventLabels[timing.eventName]} | ${timing.sampleCount} | ${timing.medianDurationMs} | ${timing.p95DurationMs} |`);
  return [
    ...heading,
    "",
    "| 階段 | 樣本數 | 中位數（ms） | P95（ms） |",
    "|---|---:|---:|---:|",
    ...rows,
    "",
  ].join("\n");
}
