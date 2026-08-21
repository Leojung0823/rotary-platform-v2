import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_MAX_RANGE_DAYS,
  parseAdjustmentReason,
  parseAdjustmentType,
  parseAttendanceDate,
  parseAttendanceRange,
  parseAttendanceUuid,
  rotaryYearStart,
} from "./validation";

describe("parseAdjustmentType", () => {
  it("accepts every type the database accepts", () => {
    for (const type of ["leave", "official_leave", "makeup", "exempt"]) {
      expect(parseAdjustmentType(type)).toBe(type);
    }
  });

  it("rejects a status that is a result rather than an adjustment", () => {
    // 'present' and 'absent' are computed, never set by hand.
    expect(() => parseAdjustmentType("present")).toThrow();
    expect(() => parseAdjustmentType("absent")).toThrow();
    expect(() => parseAdjustmentType(null)).toThrow();
  });
});

describe("parseAdjustmentReason", () => {
  it("requires a reason and trims it", () => {
    expect(parseAdjustmentReason("  住院  ")).toBe("住院");
    expect(() => parseAdjustmentReason("   ")).toThrow();
    expect(() => parseAdjustmentReason(null)).toThrow();
  });

  it("enforces the same 500-character limit as the database", () => {
    expect(parseAdjustmentReason("字".repeat(500))).toHaveLength(500);
    expect(() => parseAdjustmentReason("字".repeat(501))).toThrow();
  });
});

describe("parseAttendanceDate", () => {
  it("rejects dates the calendar does not have", () => {
    expect(() => parseAttendanceDate("2026-02-30")).toThrow();
    expect(() => parseAttendanceDate("2026-13-01")).toThrow();
    expect(() => parseAttendanceDate("2026-2-1")).toThrow();
    expect(parseAttendanceDate("2026-02-28").getUTCDate()).toBe(28);
  });
});

describe("parseAttendanceRange", () => {
  it("returns null when a bound is missing so the database default applies", () => {
    expect(parseAttendanceRange(undefined, "2026-08-01")).toBeNull();
    expect(parseAttendanceRange("2026-08-01", undefined)).toBeNull();
  });

  it("accepts a full Rotary year", () => {
    expect(parseAttendanceRange("2026-07-01", "2027-06-30")).toEqual({
      dateFrom: "2026-07-01",
      dateTo: "2027-06-30",
    });
  });

  it("rejects a reversed range", () => {
    expect(() => parseAttendanceRange("2026-08-01", "2026-07-01")).toThrow();
  });

  it("rejects a span longer than the database allows", () => {
    // The database limit is p_date_to - p_date_from <= 366.
    expect(ATTENDANCE_MAX_RANGE_DAYS).toBe(366);
    expect(parseAttendanceRange("2026-01-01", "2027-01-02")).not.toBeNull();
    expect(() => parseAttendanceRange("2026-01-01", "2027-01-03")).toThrow();
  });
});

describe("rotaryYearStart", () => {
  it("starts the year on 1 July and keeps June in the previous one", () => {
    expect(rotaryYearStart(new Date("2026-08-21T00:00:00Z"))).toBe("2026-07-01");
    expect(rotaryYearStart(new Date("2026-07-01T00:00:00Z"))).toBe("2026-07-01");
    expect(rotaryYearStart(new Date("2026-06-30T00:00:00Z"))).toBe("2025-07-01");
    expect(rotaryYearStart(new Date("2027-01-15T00:00:00Z"))).toBe("2026-07-01");
  });
});

describe("parseAttendanceUuid", () => {
  it("rejects anything that is not a uuid", () => {
    expect(() => parseAttendanceUuid("not-a-uuid")).toThrow();
    expect(() => parseAttendanceUuid("")).toThrow();
    expect(parseAttendanceUuid("6f9619ff-8b86-4d011-b42d-00cf4fc964ff".replace("4d011", "4d01")))
      .toMatch(/^[0-9a-f-]+$/u);
  });
});
