export type AttendanceCsvRow = {
  event_date: string;
  event_title: string;
  member_name: string;
  final_status: string;
  raw_checkin_method: string | null;
  raw_checked_in_at: string | null;
  adjustment_type: string | null;
  adjustment_reason: string | null;
};

const formulaPrefix = /^[=+\-@\t\r]/u;

export function neutralizeSpreadsheetFormula(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return formulaPrefix.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown) {
  return `"${neutralizeSpreadsheetFormula(value).replaceAll('"', '""')}"`;
}

export function buildAttendanceCsv(rows: AttendanceCsvRow[]) {
  const header = ["活動日期", "活動名稱", "社員姓名", "最終狀態", "原始簽到方式", "原始簽到時間", "調整類型", "調整原因"];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push([
      row.event_date,
      row.event_title,
      row.member_name,
      row.final_status,
      row.raw_checkin_method,
      row.raw_checked_in_at,
      row.adjustment_type,
      row.adjustment_reason,
    ].map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
