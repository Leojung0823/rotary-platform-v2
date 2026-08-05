const scannedCheckinTokenPattern = /^[0-9a-f]{64}$/u;

export function normalizeScannedCheckinToken(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (scannedCheckinTokenPattern.test(normalized)) return normalized;
  try {
    const parsed = new URL(value.trim());
    if (parsed.pathname !== "/checkin" || parsed.search) return null;
    const credential = new URLSearchParams(parsed.hash.slice(1)).get("credential")?.toLowerCase() ?? "";
    return scannedCheckinTokenPattern.test(credential) ? credential : null;
  } catch {
    return null;
  }
}
