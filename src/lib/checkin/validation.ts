const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const tokenPattern = /^[0-9a-f]{64}$/u;

export function parseCheckinUuid(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!uuidPattern.test(parsed)) throw new Error("invalid_uuid");
  return parsed;
}

export function parseCheckinDuration(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d+$/u.test(value)) {
    throw new Error("invalid_checkin_duration");
  }
  const duration = Number(value);
  if (!Number.isSafeInteger(duration) || duration < 5 || duration > 240) {
    throw new Error("invalid_checkin_duration");
  }
  return duration;
}

export function parseCheckinToken(value: FormDataEntryValue | null) {
  const token = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!tokenPattern.test(token)) throw new Error("invalid_checkin_token");
  return token;
}

export function parseCheckinReason(value: FormDataEntryValue | null) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason || reason.length > 500) throw new Error("invalid_checkin_reason");
  return reason;
}
