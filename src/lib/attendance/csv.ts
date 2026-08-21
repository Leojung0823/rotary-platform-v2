export type AttendanceCsvExport = {
  columns: string[];
  rows: Record<string, string | null>[];
};

export const ATTENDANCE_CSV_HEADERS: Record<string, string> = {
  event_date: "活動日期",
  event_title: "活動名稱",
  member_name: "社員姓名",
  final_status: "出席結果",
  raw_checkin_method: "簽到方式",
  raw_checked_in_at: "簽到時間",
  adjustment_type: "調整類型",
  adjustment_reason: "調整原因",
};

export function isAttendanceCsvExport(value: unknown): value is AttendanceCsvExport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return Array.isArray(payload.columns)
    && payload.columns.every((column) => typeof column === "string")
    && Array.isArray(payload.rows);
}

/**
 * Every cell is quoted rather than only the ones that need it: it keeps the
 * output stable and means a value can never terminate its own field.
 *
 * Cells arrive already neutralised against spreadsheet formula injection by
 * attendance_csv_safe_cell() in the database, which is where that belongs --
 * the same protection then applies to any other consumer of the export.
 */
export function serializeAttendanceCsv(payload: AttendanceCsvExport) {
  const escape = (value: string | null | undefined) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;

  const header = payload.columns
    .map((column) => escape(ATTENDANCE_CSV_HEADERS[column] ?? column))
    .join(",");
  const body = payload.rows.map((row) =>
    payload.columns.map((column) => escape(row[column])).join(","));

  // CRLF and a UTF-8 BOM: Excel on Windows is the tool secretaries actually
  // open these in, and without the BOM it renders Chinese names as mojibake.
  return `﻿${[header, ...body].join("\r\n")}\r\n`;
}

export function attendanceCsvFilename(eventDate: string | null, eventTitle: string | null) {
  // Trim the separators after substituting, so a title made entirely of
  // punctuation collapses to nothing and takes the fallback instead of
  // producing a filename that is just underscores.
  const safeTitle = (eventTitle ?? "")
    .replaceAll(/[^\p{L}\p{N}-]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "")
    .slice(0, 60) || "attendance";
  const datePart = eventDate ?? "export";
  return `attendance_${datePart}_${safeTitle}.csv`;
}
