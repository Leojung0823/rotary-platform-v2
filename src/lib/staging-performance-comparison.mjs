import { isPublicHostname } from "./public-hostname.mjs";

const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const COMPARISON_CONFIRMATION = "TEST-STAGING-PERFORMANCE-COMPARISON";
const ROLLBACK_CONFIRMATION = "STAGING-CODE-ROLLBACK-READY";
const CACHE_MODES = ["cold", "warm"];

function text(value) {
  return String(value ?? "").trim();
}

function validateOrigin(errors, rawValue) {
  const value = text(rawValue);
  if (!value) {
    errors.push("STAGING_BASE_URL_REQUIRED");
    return null;
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    errors.push("STAGING_BASE_URL_INVALID");
    return null;
  }

  if (parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash) {
    errors.push("STAGING_BASE_URL_HTTPS_ORIGIN_REQUIRED");
  }
  if (!isPublicHostname(parsed.hostname)) errors.push("STAGING_BASE_URL_PUBLIC_HOST_REQUIRED");
  return parsed;
}

function validateCredential(errors, input, prefix) {
  const email = text(input[`${prefix}_EMAIL`]);
  const password = String(input[`${prefix}_PASSWORD`] ?? "");
  const emailValid = EMAIL_PATTERN.test(email) && email.length <= 320;
  const passwordValid = password.length >= 12
    && password.length <= 256
    && !/[\r\n]/u.test(password);

  if (!emailValid) errors.push(`${prefix}_EMAIL_INVALID`);
  if (!passwordValid) errors.push(`${prefix}_PASSWORD_INVALID`);
  return { email, valid: emailValid && passwordValid };
}

function validateSha(errors, input, name) {
  const value = text(input[name]).toLowerCase();
  if (!COMMIT_SHA_PATTERN.test(value)) errors.push(`${name}_INVALID`);
  return value;
}

function parseSampleCount(errors, rawValue) {
  const value = text(rawValue);
  if (!/^\d+$/u.test(value)) {
    errors.push("STAGING_PERFORMANCE_SAMPLE_COUNT_INVALID");
    return null;
  }
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 5) {
    errors.push("STAGING_PERFORMANCE_SAMPLE_COUNT_OUT_OF_RANGE");
    return null;
  }
  return count;
}

function parseCacheMode(errors, rawValue) {
  const value = text(rawValue).toLowerCase();
  if (!CACHE_MODES.includes(value)) errors.push("STAGING_PERFORMANCE_CACHE_MODE_INVALID");
  return value;
}

/**
 * Validate a staging-only, code-only comparison. The workflow never applies
 * migrations: it deploys an older application revision, measures it, and
 * restores the approved revision in an always-run cleanup step.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input
 */
export function inspectStagingPerformanceComparisonInput(input = process.env) {
  const errors = [];
  const eventName = text(input.GITHUB_EVENT_NAME);
  const refName = text(input.GITHUB_REF_NAME);
  const workflowSha = text(input.GITHUB_SHA).toLowerCase();
  const baselineSha = validateSha(errors, input, "STAGING_BASELINE_SHA");
  const restoreSha = validateSha(errors, input, "STAGING_RESTORE_SHA");
  const member = validateCredential(errors, input, "STAGING_TEST_MEMBER");
  const operator = validateCredential(errors, input, "STAGING_TEST_OPERATOR");
  const expectedClubName = text(input.STAGING_EXPECTED_CLUB_NAME);
  const siteUrl = validateOrigin(errors, input.STAGING_BASE_URL);
  const sampleCount = parseSampleCount(errors, input.STAGING_PERFORMANCE_SAMPLE_COUNT);
  const cacheMode = parseCacheMode(errors, input.STAGING_PERFORMANCE_CACHE_MODE);

  if (eventName !== "workflow_dispatch") errors.push("STAGING_PERFORMANCE_COMPARISON_MANUAL_ONLY");
  if (refName !== "main") errors.push("STAGING_PERFORMANCE_COMPARISON_MAIN_ONLY");
  if (!COMMIT_SHA_PATTERN.test(workflowSha)) errors.push("GITHUB_SHA_INVALID");
  if (COMMIT_SHA_PATTERN.test(baselineSha) && COMMIT_SHA_PATTERN.test(restoreSha)
    && baselineSha === restoreSha) {
    errors.push("STAGING_BASELINE_AND_RESTORE_MUST_DIFFER");
  }
  if (text(input.STAGING_PERFORMANCE_COMPARISON_CONFIRMATION) !== COMPARISON_CONFIRMATION) {
    errors.push("STAGING_PERFORMANCE_COMPARISON_CONFIRMATION_MISMATCH");
  }
  if (text(input.STAGING_ROLLBACK_CONFIRMATION) !== ROLLBACK_CONFIRMATION) {
    errors.push("STAGING_ROLLBACK_CONFIRMATION_MISMATCH");
  }
  if (!expectedClubName || expectedClubName.length > 160) {
    errors.push("STAGING_EXPECTED_CLUB_NAME_INVALID");
  }
  if (member.email && operator.email && member.email.toLowerCase() === operator.email.toLowerCase()) {
    errors.push("STAGING_PERFORMANCE_IDENTITIES_MUST_DIFFER");
  }

  return {
    ok: errors.length === 0,
    eventName: eventName || "unknown",
    refName: refName || "unknown",
    workflowSha: COMMIT_SHA_PATTERN.test(workflowSha) ? workflowSha : null,
    baselineSha: COMMIT_SHA_PATTERN.test(baselineSha) ? baselineSha : null,
    restoreSha: COMMIT_SHA_PATTERN.test(restoreSha) ? restoreSha : null,
    siteOrigin: siteUrl?.origin ?? null,
    credentialsConfigured: member.valid && operator.valid && member.email !== operator.email,
    expectedClubConfigured: Boolean(expectedClubName),
    sampleCount,
    cacheMode: CACHE_MODES.includes(cacheMode) ? cacheMode : null,
    errors,
  };
}

function finiteMetric(value) {
  return Number.isFinite(value) ? value : null;
}

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeMetric(beforeSamples, afterSamples, key) {
  const beforeValues = beforeSamples.map((sample) => finiteMetric(sample[key])).filter((value) => value !== null);
  const afterValues = afterSamples.map((sample) => finiteMetric(sample[key])).filter((value) => value !== null);
  if (beforeValues.length === 0 || afterValues.length === 0) {
    return { beforeMs: null, afterMs: null, deltaMs: null, changePercent: null };
  }

  const beforeMs = median(beforeValues);
  const afterMs = median(afterValues);
  return {
    beforeMs,
    afterMs,
    deltaMs: afterMs - beforeMs,
    changePercent: beforeMs === 0 ? null : ((afterMs - beforeMs) / beforeMs) * 100,
  };
}

function validateResults(results, label) {
  if (!results || typeof results !== "object") throw new Error(`${label}_RESULT_INVALID`);
  if (!COMMIT_SHA_PATTERN.test(String(results.expectedSha ?? ""))) throw new Error(`${label}_SHA_INVALID`);
  if (!CACHE_MODES.includes(results.cacheMode)) throw new Error(`${label}_CACHE_MODE_INVALID`);
  if (!Array.isArray(results.routes) || results.routes.length === 0) throw new Error(`${label}_ROUTES_INVALID`);
  for (const route of results.routes) {
    if (!route || typeof route.label !== "string" || !Array.isArray(route.samples) || route.samples.length === 0) {
      throw new Error(`${label}_SAMPLE_SET_INVALID`);
    }
  }
}

/**
 * Compare two sanitized performance result files. No page content or
 * credentials are read; only the numeric metrics and route labels are used.
 */
export function compareStagingPerformanceResults(before, after) {
  validateResults(before, "BEFORE");
  validateResults(after, "AFTER");
  if (before.cacheMode !== after.cacheMode) throw new Error("CACHE_MODE_MISMATCH");

  const beforeRoutes = new Map(before.routes.map((route) => [route.label, route]));
  const afterRoutes = new Map(after.routes.map((route) => [route.label, route]));
  if (beforeRoutes.size !== afterRoutes.size || [...beforeRoutes.keys()].some((label) => !afterRoutes.has(label))) {
    throw new Error("ROUTE_SET_MISMATCH");
  }

  const metrics = ["lcpMs", "fcpMs", "ttfbMs", "inpMs"];
  const routes = [...beforeRoutes.keys()].map((label) => {
    const beforeRoute = beforeRoutes.get(label);
    const afterRoute = afterRoutes.get(label);
    return {
      label,
      sampleCountBefore: beforeRoute.samples.length,
      sampleCountAfter: afterRoute.samples.length,
      metrics: Object.fromEntries(metrics.map((metric) => [
        metric,
        summarizeMetric(beforeRoute.samples, afterRoute.samples, metric),
      ])),
    };
  });

  return {
    beforeSha: before.expectedSha,
    afterSha: after.expectedSha,
    cacheMode: before.cacheMode,
    routes,
  };
}

export { CACHE_MODES, COMPARISON_CONFIRMATION, ROLLBACK_CONFIRMATION };
