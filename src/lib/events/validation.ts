export const EVENT_TYPES = [
  "regular_meeting",
  "board_meeting",
  "service",
  "joint_meeting",
  "fireside",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];
export type EventResponse = "pending" | "attending" | "declined";

export function parseEventType(value: FormDataEntryValue | null): EventType {
  if (typeof value !== "string" || !EVENT_TYPES.includes(value as EventType)) {
    throw new Error("invalid_event_type");
  }
  return value as EventType;
}

export function parseEventText(
  value: FormDataEntryValue | null,
  maximum: number,
  required = false,
) {
  if (typeof value !== "string") throw new Error("invalid_event_text");
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maximum) {
    throw new Error("invalid_event_text");
  }
  return normalized;
}

export function parseTaipeiDateTime(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) {
    throw new Error("invalid_event_time");
  }
  const parsed = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(parsed.getTime())) throw new Error("invalid_event_time");
  return parsed.toISOString();
}

export function parseOptionalCapacity(value: FormDataEntryValue | null) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d+$/u.test(value)) throw new Error("invalid_event_capacity");
  const capacity = Number(value);
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 10000) {
    throw new Error("invalid_event_capacity");
  }
  return capacity;
}

export function parseEventResponse(value: FormDataEntryValue | null): EventResponse {
  if (value !== "pending" && value !== "attending" && value !== "declined") {
    throw new Error("invalid_event_response");
  }
  return value;
}

export function parseGuestCount(value: FormDataEntryValue | null, response: EventResponse) {
  if (value === null || value === "") return 0;
  if (typeof value !== "string" || !/^\d+$/u.test(value)) throw new Error("invalid_guest_count");
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0 || count > 20) throw new Error("invalid_guest_count");
  if (response !== "attending" && count !== 0) throw new Error("invalid_guest_count");
  return count;
}
