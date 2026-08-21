// These rules deliberately mirror the database's own checks in
// 20260811000100_attendance_domain_core.sql (adjustment types, 500-character
// reasons, and the 366-day range limit). The database remains the authority --
// duplicating them here only turns a would-be 500 into a readable message.

export const ADJUSTMENT_TYPES = ["leave", "official_leave", "makeup", "exempt"] as const;

export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const ATTENDANCE_MAX_RANGE_DAYS = 366;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function parseAttendanceUuid(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!uuidPattern.test(parsed)) throw new Error("invalid_uuid");
  return parsed;
}

export function parseAdjustmentType(value: FormDataEntryValue | null): AdjustmentType {
  if (typeof value !== "string" || !ADJUSTMENT_TYPES.includes(value as AdjustmentType)) {
    throw new Error("invalid_attendance_adjustment");
  }
  return value as AdjustmentType;
}

export function parseAdjustmentReason(value: FormDataEntryValue | null) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason || reason.length > 500) throw new Error("invalid_attendance_reason");
  return reason;
}

/** Accepts a calendar date and rejects ones the calendar does not have, such as 2026-02-30. */
export function parseAttendanceDate(value: string) {
  const match = datePattern.exec(value);
  if (!match) throw new Error("invalid_attendance_date");
  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("invalid_attendance_date");
  }
  return date;
}

export type AttendanceRange = { dateFrom: string; dateTo: string };

/**
 * Returns null when either bound is absent so the caller can let the database
 * apply its own default (the current Rotary year), and throws only when a
 * supplied range is unusable.
 */
export function parseAttendanceRange(
  dateFromValue: string | undefined,
  dateToValue: string | undefined,
): AttendanceRange | null {
  if (!dateFromValue || !dateToValue) return null;
  const from = parseAttendanceDate(dateFromValue);
  const to = parseAttendanceDate(dateToValue);
  if (to.getTime() < from.getTime()) throw new Error("invalid_attendance_date_range");
  const spanDays = (to.getTime() - from.getTime()) / 86_400_000;
  if (spanDays > ATTENDANCE_MAX_RANGE_DAYS) throw new Error("invalid_attendance_date_range");
  return { dateFrom: dateFromValue, dateTo: dateToValue };
}

/** The Rotary year runs 1 July to 30 June; this matches current_rotary_year_start(). */
export function rotaryYearStart(today: Date) {
  const year = today.getUTCFullYear() - (today.getUTCMonth() >= 6 ? 0 : 1);
  return `${year}-07-01`;
}
