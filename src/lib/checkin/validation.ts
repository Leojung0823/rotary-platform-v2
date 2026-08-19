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

const coordinatePattern = /^-?\d{1,3}(?:\.\d{1,8})?$/u;

// The browser supplies these from the Geolocation API. They are validated for
// shape and range only; the server never persists or logs them.
export function parseCheckinCoordinates(
  latitudeValue: FormDataEntryValue | null,
  longitudeValue: FormDataEntryValue | null,
) {
  const latitudeText = typeof latitudeValue === "string" ? latitudeValue.trim() : "";
  const longitudeText = typeof longitudeValue === "string" ? longitudeValue.trim() : "";
  if (!coordinatePattern.test(latitudeText) || !coordinatePattern.test(longitudeText)) {
    throw new Error("invalid_checkin_location");
  }
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90
    || longitude < -180 || longitude > 180) {
    throw new Error("invalid_checkin_location");
  }
  return { latitude, longitude };
}

export function parseCheckinReason(value: FormDataEntryValue | null) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason || reason.length > 500) throw new Error("invalid_checkin_reason");
  return reason;
}
