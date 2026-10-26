const SAFE_STATIC_PATH = /^\/(?:_next\/static|assets|images)\/[A-Za-z0-9._/-]+$|^\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:avif|gif|jpe?g|png|svg|webp)$/iu;
const SAFE_MODULE_CLASS = /^[A-Za-z][A-Za-z0-9_-]{0,64}__[A-Za-z0-9_-]{2,24}__[A-Za-z][A-Za-z0-9_-]{0,64}$/u;
const SAFE_INITIATOR_TYPES = new Set([
  "audio",
  "css",
  "fetch",
  "img",
  "link",
  "other",
  "script",
  "xmlhttprequest",
]);

function round(value) {
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 10) / 10 : null;
}

function resolveResource(rawUrl, currentOrigin) {
  if (typeof rawUrl !== "string" || !rawUrl || typeof currentOrigin !== "string") return null;

  try {
    const pageOrigin = new URL(currentOrigin).origin;
    const parsed = new URL(rawUrl, pageOrigin);
    let resourcePath = parsed.origin === pageOrigin && SAFE_STATIC_PATH.test(parsed.pathname)
      ? parsed.pathname
      : null;

    // Next Image places the source URL in a query parameter. Only expose it
    // when it resolves to a same-origin, allow-listed static asset path.
    if (parsed.origin === pageOrigin && parsed.pathname === "/_next/image" && !resourcePath) {
      const source = parsed.searchParams.get("url");
      if (source) {
        const sourceUrl = new URL(source, pageOrigin);
        if (sourceUrl.origin === pageOrigin && SAFE_STATIC_PATH.test(sourceUrl.pathname)) {
          resourcePath = sourceUrl.pathname;
        }
      }
    }

    return {
      origin: parsed.origin === pageOrigin ? "same-origin" : "cross-origin",
      path: resourcePath,
    };
  } catch {
    return null;
  }
}

/**
 * Reduce browser LCP and Resource Timing entries to a privacy-safe diagnostic.
 * Never return page text, full selectors, query strings, hostnames, or arbitrary paths.
 * A CSS-module class is retained only when it matches the static build-generated shape.
 * @param {{currentOrigin?: unknown, lcp?: Record<string, unknown> | null, resource?: Record<string, unknown> | null}} input
 */
export function sanitizeStagingLcpAttribution({ currentOrigin, lcp, resource } = {}) {
  const elementTag = typeof lcp?.elementTag === "string"
    && /^[a-z][a-z0-9-]{0,30}$/iu.test(lcp.elementTag)
    ? lcp.elementTag.toLowerCase()
    : null;
  const moduleClass = typeof lcp?.moduleClass === "string" && SAFE_MODULE_CLASS.test(lcp.moduleClass)
    ? lcp.moduleClass
    : null;
  const resolvedResource = resolveResource(lcp?.url, currentOrigin);
  const initiatorType = typeof resource?.initiatorType === "string"
    && SAFE_INITIATOR_TYPES.has(resource.initiatorType.toLowerCase())
    ? resource.initiatorType.toLowerCase()
    : null;

  const startTimeMs = round(resource?.startTime);
  const responseEndMs = round(resource?.responseEnd);
  const durationMs = round(resource?.duration);
  const lcpTimeMs = round(lcp?.startTime);

  return {
    elementTag,
    moduleClass,
    isImage: lcp?.isImage === true,
    lcpTimeMs,
    renderTimeMs: round(lcp?.renderTime),
    loadTimeMs: round(lcp?.loadTime),
    sizeCssPx: round(lcp?.size),
    resourceOrigin: resolvedResource?.origin ?? "unavailable",
    resourcePath: resolvedResource?.path ?? null,
    initiatorType,
    resourceStartTimeMs: startTimeMs,
    resourceResponseEndMs: responseEndMs,
    resourceDurationMs: durationMs,
    afterResourceRenderDelayMs: lcpTimeMs !== null && responseEndMs !== null && responseEndMs > 0
      ? round(Math.max(0, lcpTimeMs - responseEndMs))
      : null,
    transferSizeBytes: Number.isFinite(resource?.transferSize) && resource.transferSize >= 0
      ? resource.transferSize
      : null,
    encodedBodySizeBytes: Number.isFinite(resource?.encodedBodySize) && resource.encodedBodySize >= 0
      ? resource.encodedBodySize
      : null,
    decodedBodySizeBytes: Number.isFinite(resource?.decodedBodySize) && resource.decodedBodySize >= 0
      ? resource.decodedBodySize
      : null,
  };
}
