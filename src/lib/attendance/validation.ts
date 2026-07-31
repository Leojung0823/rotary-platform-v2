const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

export const attendanceAdjustmentTypes = ["leave", "official_leave", "makeup", "exempt"] as const;
export type AttendanceAdjustmentType = (typeof attendanceAdjustmentTypes)[number];

export function parseAttendanceUuid(value: FormDataEntryValue | string | null | undefined) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!uuidPattern.test(parsed)) throw new Error("invalid_attendance_uuid");
  return parsed.toLowerCase();
}

export function parseAttendanceAdjustmentType(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? value.trim() : "";
  if (!attendanceAdjustmentTypes.includes(parsed as AttendanceAdjustmentType)) {
    throw new Error("invalid_attendance_adjustment_type");
  }
  return parsed as AttendanceAdjustmentType;
}

export function parseAttendanceReason(value: FormDataEntryValue | null) {
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason || reason.length > 500) throw new Error("invalid_attendance_reason");
  return reason;
}

export function parseAttendanceDate(value: string | undefined, fallback: string) {
  const parsed = value?.trim() ?? "";
  const timestamp = Date.parse(`${parsed}T00:00:00Z`);
  if (!datePattern.test(parsed) || Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== parsed) return fallback;
  return parsed;
}

export function attendanceDateRange(dateFrom: string, dateTo: string) {
  const from = Date.parse(`${dateFrom}T00:00:00Z`);
  const to = Date.parse(`${dateTo}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to || to - from > 366 * 86_400_000) {
    throw new Error("invalid_attendance_date_range");
  }
  return { dateFrom, dateTo };
}
