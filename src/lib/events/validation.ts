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

export const EVENT_CREATE_FIELDS = [
  "eventType",
  "title",
  "startsAt",
  "endsAt",
  "registrationDeadline",
  "capacity",
  "location",
  "venueLocation",
  "countsForAttendance",
  "description",
] as const;

export type EventCreateField = (typeof EVENT_CREATE_FIELDS)[number];
export type EventCreateFieldErrors = Partial<Record<EventCreateField, string>>;

export type EventCreateFormValues = {
  eventType: string;
  title: string;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string;
  capacity: string;
  location: string;
  venueLocation: string;
  countsForAttendance: boolean;
  description: string;
};

export type VenueCoordinates = { latitude: number; longitude: number };

export type EventCreateActionState = {
  status: "idle" | "error";
  revision: number;
  values: EventCreateFormValues;
  fieldErrors: EventCreateFieldErrors;
  formError?: string;
};

type ValidEventCreateInput = {
  eventType: EventType;
  title: string;
  startsAt: string;
  endsAt: string;
  registrationDeadline: string;
  capacity: number | null;
  location: string;
  venue: VenueCoordinates | null;
  countsForAttendance: boolean;
  description: string;
};

export type EventCreateValidation =
  | { ok: true; input: ValidEventCreateInput }
  | { ok: false; fieldErrors: EventCreateFieldErrors };

export const initialEventCreateFormValues: EventCreateFormValues = {
  eventType: "regular_meeting",
  title: "",
  startsAt: "",
  endsAt: "",
  registrationDeadline: "",
  capacity: "",
  location: "",
  venueLocation: "",
  countsForAttendance: true,
  description: "",
};

export const initialEventCreateActionState: EventCreateActionState = {
  status: "idle",
  revision: 0,
  values: initialEventCreateFormValues,
  fieldErrors: {},
};

function boundedFormString(value: FormDataEntryValue | null, maximum: number) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

export function readEventCreateFormValues(formData: FormData): EventCreateFormValues {
  return {
    eventType: boundedFormString(formData.get("eventType"), 64),
    title: boundedFormString(formData.get("title"), 161),
    startsAt: boundedFormString(formData.get("startsAt"), 32),
    endsAt: boundedFormString(formData.get("endsAt"), 32),
    registrationDeadline: boundedFormString(formData.get("registrationDeadline"), 32),
    capacity: boundedFormString(formData.get("capacity"), 32),
    location: boundedFormString(formData.get("location"), 301),
    venueLocation: boundedFormString(formData.get("venueLocation"), 2049),
    countsForAttendance: formData.get("countsForAttendance") === "on",
    description: boundedFormString(formData.get("description"), 5001),
  };
}

function hasErrors(fieldErrors: EventCreateFieldErrors) {
  return Object.keys(fieldErrors).length > 0;
}

export function validateEventCreateForm(values: EventCreateFormValues): EventCreateValidation {
  const fieldErrors: EventCreateFieldErrors = {};
  let eventType: EventType | undefined;
  let title: string | undefined;
  let startsAt: string | undefined;
  let endsAt: string | undefined;
  let registrationDeadline: string | undefined;
  let capacity: number | null | undefined;
  let location: string | undefined;
  let venue: VenueCoordinates | null | undefined;
  let description: string | undefined;

  try {
    eventType = parseEventType(values.eventType);
  } catch {
    fieldErrors.eventType = "請選擇有效的活動類型。";
  }
  try {
    title = parseEventText(values.title, 160, true);
  } catch {
    fieldErrors.title = values.title.trim()
      ? "活動名稱不可超過 160 字。"
      : "請輸入活動名稱。";
  }
  try {
    startsAt = parseTaipeiDateTime(values.startsAt);
  } catch {
    fieldErrors.startsAt = "請輸入有效的開始日期與時間。";
  }
  try {
    endsAt = parseTaipeiDateTime(values.endsAt);
  } catch {
    fieldErrors.endsAt = "請輸入有效的結束日期與時間。";
  }
  try {
    registrationDeadline = parseTaipeiDateTime(values.registrationDeadline);
  } catch {
    fieldErrors.registrationDeadline = "請輸入有效的報名截止日期與時間。";
  }
  try {
    capacity = parseOptionalCapacity(values.capacity);
  } catch {
    fieldErrors.capacity = "名額必須是 1 至 10000 的整數，或留空表示不限。";
  }
  try {
    location = parseEventText(values.location, 300);
  } catch {
    fieldErrors.location = "地點不可超過 300 字。";
  }
  try {
    venue = parseOptionalVenueLocation(values.venueLocation);
  } catch {
    fieldErrors.venueLocation = "請貼上地圖連結或「緯度, 經度」，例如 25.033964, 121.564468；留空則此活動不開放定位簽到。";
  }
  try {
    description = parseEventText(values.description, 5000);
  } catch {
    fieldErrors.description = "活動說明不可超過 5000 字。";
  }

  if (startsAt && endsAt && endsAt <= startsAt) {
    fieldErrors.endsAt = "結束時間必須晚於開始時間。";
  }
  if (startsAt && registrationDeadline && registrationDeadline > startsAt) {
    fieldErrors.registrationDeadline = "報名截止時間不得晚於活動開始時間。";
  }

  if (hasErrors(fieldErrors)) return { ok: false, fieldErrors };

  return {
    ok: true,
    input: {
      eventType: eventType!,
      title: title!,
      startsAt: startsAt!,
      endsAt: endsAt!,
      registrationDeadline: registrationDeadline!,
      capacity: capacity!,
      location: location!,
      venue: venue!,
      countsForAttendance: values.countsForAttendance,
      description: description!,
    },
  };
}

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
  if (typeof value !== "string") throw new Error("invalid_event_time");
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  if (!match) throw new Error("invalid_event_time");

  const [, yearValue, monthValue, dayValue, hourValue, minuteValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, 0, 0);

  if (
    local.getUTCFullYear() !== year
    || local.getUTCMonth() !== month - 1
    || local.getUTCDate() !== day
    || local.getUTCHours() !== hour
    || local.getUTCMinutes() !== minute
  ) {
    throw new Error("invalid_event_time");
  }

  return new Date(local.getTime() - 8 * 60 * 60 * 1000).toISOString();
}

// Secretaries get venue coordinates by looking the place up on a map and
// copying, so accept what that actually puts on the clipboard -- a map URL or
// a bare "lat, lng" pair -- rather than making them split the numbers by hand.
// Everything is parsed locally; no geocoding service is contacted.
const COORDINATE_PAIR = /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/u;
const MAP_URL_PATTERNS = [
  /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/u,
  /[?&]q=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/u,
  /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/u,
];

export function parseOptionalVenueLocation(
  value: FormDataEntryValue | null,
): VenueCoordinates | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("invalid_event_venue_location");
  const normalized = value.trim();
  if (!normalized) return null;

  let pair = COORDINATE_PAIR.exec(normalized);
  if (!pair) {
    for (const pattern of MAP_URL_PATTERNS) {
      pair = pattern.exec(normalized);
      if (pair) break;
    }
  }
  if (!pair) throw new Error("invalid_event_venue_location");

  const latitude = Number(pair[1]);
  const longitude = Number(pair[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90
    || longitude < -180 || longitude > 180) {
    throw new Error("invalid_event_venue_location");
  }
  // Six decimals is ~0.1m, far finer than the 200m radius needs, and keeps the
  // value inside the numeric(9,6) column.
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
  };
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
