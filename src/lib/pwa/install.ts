export const INSTALL_PAGE_HREF = "/install?openExternalBrowser=1";

export const INSTALL_DISMISSAL_KEY = "rotary-install-card-dismissed-until";
export const INSTALL_DISMISSAL_MS = 7 * 24 * 60 * 60 * 1000;

export function installCardDismissalExpiresAt(now = Date.now()): number {
  return now + INSTALL_DISMISSAL_MS;
}

export function isInstallCardDismissed(dismissedUntilValue: string | null, now = Date.now()): boolean {
  const dismissedUntil = Number(dismissedUntilValue ?? 0);
  return Number.isFinite(dismissedUntil) && dismissedUntil > now;
}

export type InstallPlatform = "ios" | "android" | "other";

export function detectInstallPlatform(
  userAgent: string,
  platform = "",
  maxTouchPoints = 0,
): InstallPlatform {
  if (/iPhone|iPad|iPod/iu.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/iu.test(userAgent)) return "android";
  return "other";
}

export function detectEmbeddedBrowser(userAgent: string): "line" | "facebook" | "other" | null {
  if (/\bLine\//iu.test(userAgent) || /LIFF/iu.test(userAgent)) return "line";
  if (/FBAN|FBAV|Instagram/iu.test(userAgent)) return "facebook";
  if (/; wv\)|WebView|Twitter/iu.test(userAgent)) return "other";
  return null;
}

/**
 * LINE uses this query parameter to open an ordinary web URL externally.
 * LIFF URLs are intentionally left untouched because LINE ignores the
 * parameter for them.
 */
export function withLineExternalBrowser(url: string, baseUrl = "https://rotary.invalid"): string {
  let parsed: URL;
  try {
    parsed = new URL(url, baseUrl);
  } catch {
    return url;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return url;
  if (parsed.hostname === "liff.line.me") return url;

  parsed.searchParams.set("openExternalBrowser", "1");
  const isAbsolute = /^[a-z][a-z\d+.-]*:/iu.test(url);
  return isAbsolute
    ? parsed.toString()
    : `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function externalInstallUrl(origin: string): string {
  let pageUrl: URL;
  try {
    pageUrl = new URL("/install", origin);
  } catch {
    return withLineExternalBrowser("/install");
  }
  return withLineExternalBrowser(pageUrl.toString());
}
