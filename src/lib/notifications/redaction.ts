const errorAllowlist = new Set([
  "provider_temporary",
  "network_temporary",
  "rate_limited",
  "provider_permanent",
  "recipient_unavailable",
  "disabled",
]);

const forbiddenAuditKeys = /(?:body|content|email|line|auth|account|membership|person|recipient|secret|token|cookie|provider_response)/iu;

export function generalizedDeliveryError(value: unknown) {
  return typeof value === "string" && errorAllowlist.has(value) ? value : "provider_permanent";
}

export function redactAuditMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !forbiddenAuditKeys.test(key)));
}

export function safeWorkerLog(counts: Record<string, number>) {
  return JSON.stringify(Object.fromEntries(
    Object.entries(counts).filter(([key, value]) => /^[a-z_]+$/u.test(key) && Number.isInteger(value) && value >= 0),
  ));
}
