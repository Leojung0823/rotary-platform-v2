export type AttendanceClub = {
  club_id: string;
  club_code: string;
  club_name: string;
  membership_id: string | null;
  can_manage: boolean;
};

export type AttendanceTrend = {
  period: string;
  denominator: number;
  attended: number;
  attendance_rate: number;
};

export type AttendanceSummary = {
  date_from: string;
  date_to: string;
  denominator: number;
  attended: number;
  attendance_rate?: number;
  average_attendance_rate?: number;
  present?: number;
  makeup?: number;
  official_leave?: number;
  leave?: number;
  exempt?: number;
  absent?: number;
  pending_absences: number;
  unconfirmed_records: number;
  trend: AttendanceTrend[];
};

export type AttendanceHistoryRow = {
  event_id: string;
  event_date: string;
  event_title: string;
  final_status: string;
  in_denominator: boolean;
  attendance_credit: boolean;
  raw_checkin_method: string | null;
  raw_checked_in_at: string | null;
  adjustment_type: string | null;
  adjustment_reason: string | null;
};

export type AttendanceRosterMember = {
  membership_id: string;
  display_name: string;
  membership_status: string;
  final_status: string;
  in_denominator: boolean;
  attendance_credit: boolean;
  raw_attendance_id: string | null;
  raw_attendance_status: string | null;
  raw_checkin_method: string | null;
  raw_checked_in_at: string | null;
  raw_checkin_note: string | null;
  adjustment_id: string | null;
  adjustment_type: string | null;
  adjustment_reason: string | null;
  adjustment_created_at: string | null;
};

export type AdjustmentHistoryRow = {
  adjustment_id: string;
  membership_id: string;
  display_name: string;
  adjustment_type: string;
  reason: string;
  created_at: string;
  revoked_at: string | null;
  revocation_reason: string | null;
};

export type AttendanceRoster = {
  event: {
    id: string;
    title: string;
    starts_at: string;
    status: string;
    counts_for_attendance: boolean;
  };
  members: AttendanceRosterMember[];
  adjustment_history: AdjustmentHistoryRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nullableString(value: unknown) {
  return value === null || typeof value === "string";
}

export function parseAttendanceClubs(value: unknown): AttendanceClub[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((item) => isRecord(item)
    && typeof item.club_id === "string"
    && typeof item.club_code === "string"
    && typeof item.club_name === "string"
    && nullableString(item.membership_id)
    && typeof item.can_manage === "boolean")) return null;
  return value as AttendanceClub[];
}

export function parseAttendanceHistory(value: unknown): AttendanceHistoryRow[] | null {
  if (!isRecord(value) || !Array.isArray(value.records)) return null;
  if (!value.records.every((item) => isRecord(item)
    && typeof item.event_id === "string"
    && typeof item.event_date === "string"
    && typeof item.event_title === "string"
    && typeof item.final_status === "string"
    && typeof item.in_denominator === "boolean"
    && typeof item.attendance_credit === "boolean"
    && nullableString(item.raw_checkin_method)
    && nullableString(item.raw_checked_in_at)
    && nullableString(item.adjustment_type)
    && nullableString(item.adjustment_reason))) return null;
  return value.records as AttendanceHistoryRow[];
}

export function parseAttendanceSummary(value: unknown): AttendanceSummary | null {
  if (!isRecord(value)
    || typeof value.date_from !== "string"
    || typeof value.date_to !== "string"
    || typeof value.denominator !== "number"
    || typeof value.attended !== "number"
    || typeof value.pending_absences !== "number"
    || typeof value.unconfirmed_records !== "number"
    || !Array.isArray(value.trend)) return null;
  if (value.attendance_rate !== undefined && typeof value.attendance_rate !== "number") return null;
  if (value.average_attendance_rate !== undefined && typeof value.average_attendance_rate !== "number") return null;
  if (!value.trend.every((item) => isRecord(item)
    && typeof item.period === "string"
    && typeof item.denominator === "number"
    && typeof item.attended === "number"
    && typeof item.attendance_rate === "number")) return null;
  return value as AttendanceSummary;
}

export function parseAttendanceRoster(value: unknown): AttendanceRoster | null {
  if (!isRecord(value) || !isRecord(value.event)
    || typeof value.event.id !== "string"
    || typeof value.event.title !== "string"
    || typeof value.event.starts_at !== "string"
    || typeof value.event.status !== "string"
    || typeof value.event.counts_for_attendance !== "boolean"
    || !Array.isArray(value.members)
    || !Array.isArray(value.adjustment_history)) return null;
  if (!value.members.every((item) => isRecord(item)
    && typeof item.membership_id === "string"
    && typeof item.display_name === "string"
    && typeof item.membership_status === "string"
    && typeof item.final_status === "string"
    && typeof item.in_denominator === "boolean"
    && typeof item.attendance_credit === "boolean"
    && nullableString(item.raw_attendance_id)
    && nullableString(item.raw_attendance_status)
    && nullableString(item.raw_checkin_method)
    && nullableString(item.raw_checked_in_at)
    && nullableString(item.raw_checkin_note)
    && nullableString(item.adjustment_id)
    && nullableString(item.adjustment_type)
    && nullableString(item.adjustment_reason)
    && nullableString(item.adjustment_created_at))) return null;
  if (!value.adjustment_history.every((item) => isRecord(item)
    && typeof item.adjustment_id === "string"
    && typeof item.membership_id === "string"
    && typeof item.display_name === "string"
    && typeof item.adjustment_type === "string"
    && typeof item.reason === "string"
    && typeof item.created_at === "string"
    && nullableString(item.revoked_at)
    && nullableString(item.revocation_reason))) return null;
  return value as unknown as AttendanceRoster;
}
