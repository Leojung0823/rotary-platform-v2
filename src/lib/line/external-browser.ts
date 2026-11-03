/** Add LINE's external-browser hint to ordinary web links, not LIFF URLs. */
export function withExternalBrowser(url: string, baseUrl = "https://rotary.invalid"): string {
  let parsed: URL;
  try { parsed = new URL(url, baseUrl); } catch { return url; }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.hostname === "liff.line.me") return url;
  parsed.searchParams.set("openExternalBrowser", "1");
  return /^[a-z][a-z\d+.-]*:/iu.test(url) ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
