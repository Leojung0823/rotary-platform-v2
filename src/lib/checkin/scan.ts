const scannedCheckinTokenPattern = /^[0-9a-f]{64}$/u;

export function normalizeScannedCheckinToken(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return scannedCheckinTokenPattern.test(normalized) ? normalized : null;
}
