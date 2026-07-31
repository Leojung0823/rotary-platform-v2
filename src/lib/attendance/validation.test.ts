import { describe, expect, it } from "vitest";
import {
  attendanceDateRange,
  parseAttendanceAdjustmentType,
  parseAttendanceDate,
  parseAttendanceReason,
  parseAttendanceUuid,
} from "./validation";

describe("attendance input validation", () => {
  it("validates tenant and record UUIDs", () => {
    expect(parseAttendanceUuid("57000000-0000-4000-8000-000000000001")).toBe("57000000-0000-4000-8000-000000000001");
    expect(() => parseAttendanceUuid("../other-club")).toThrow("invalid_attendance_uuid");
  });

  it("accepts only the four adjustment types", () => {
    for (const type of ["leave", "official_leave", "makeup", "exempt"]) {
      expect(parseAttendanceAdjustmentType(type)).toBe(type);
    }
    expect(() => parseAttendanceAdjustmentType("present")).toThrow("invalid_attendance_adjustment_type");
  });

  it("requires a bounded reason", () => {
    expect(parseAttendanceReason(" 代表本社出席地區活動 ")).toBe("代表本社出席地區活動");
    expect(() => parseAttendanceReason(" ")).toThrow("invalid_attendance_reason");
    expect(() => parseAttendanceReason("x".repeat(501))).toThrow("invalid_attendance_reason");
  });

  it("keeps date queries valid and bounded to 366 days", () => {
    expect(parseAttendanceDate("2026-07-31", "2026-01-01")).toBe("2026-07-31");
    expect(parseAttendanceDate("2026-02-31", "2026-01-01")).toBe("2026-01-01");
    expect(attendanceDateRange("2026-01-01", "2026-12-31")).toEqual({ dateFrom: "2026-01-01", dateTo: "2026-12-31" });
    expect(() => attendanceDateRange("2025-01-01", "2026-12-31")).toThrow("invalid_attendance_date_range");
  });
});
