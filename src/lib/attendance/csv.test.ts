import { describe, expect, it } from "vitest";
import {
  attendanceCsvFilename,
  isAttendanceCsvExport,
  serializeAttendanceCsv,
} from "./csv";

const columns = ["member_name", "final_status"];

describe("serializeAttendanceCsv", () => {
  it("translates column keys into the headers a secretary reads", () => {
    const csv = serializeAttendanceCsv({ columns, rows: [] });
    expect(csv).toContain('"社員姓名","出席結果"');
  });

  it("quotes every cell so a value cannot terminate its own field", () => {
    const csv = serializeAttendanceCsv({
      columns,
      rows: [{ member_name: "王, 大明", final_status: 'said "here"' }],
    });
    expect(csv).toContain('"王, 大明","said ""here"""');
  });

  it("renders a missing cell as empty rather than the string null", () => {
    const csv = serializeAttendanceCsv({
      columns,
      rows: [{ member_name: "陳小華", final_status: null }],
    });
    expect(csv).toContain('"陳小華",""');
    expect(csv).not.toContain("null");
  });

  it("emits a BOM and CRLF so Excel reads Chinese names correctly", () => {
    const csv = serializeAttendanceCsv({ columns, rows: [] });
    expect(csv.codePointAt(0)).toBe(0xfeff);
    expect(csv).toContain("\r\n");
  });
});

describe("isAttendanceCsvExport", () => {
  it("rejects payloads that are not the export shape", () => {
    expect(isAttendanceCsvExport(null)).toBe(false);
    expect(isAttendanceCsvExport([])).toBe(false);
    expect(isAttendanceCsvExport({ columns: [1], rows: [] })).toBe(false);
    expect(isAttendanceCsvExport({ columns: ["a"], rows: [] })).toBe(true);
  });
});

describe("attendanceCsvFilename", () => {
  it("strips characters that would break the download header", () => {
    const name = attendanceCsvFilename("2026-08-21", '例會 "第一次"/測試');
    expect(name).toBe("attendance_2026-08-21_例會_第一次_測試.csv");
  });

  it("falls back when the event has no usable title", () => {
    expect(attendanceCsvFilename(null, "///")).toBe("attendance_export_attendance.csv");
  });
});
