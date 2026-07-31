import { describe, expect, it } from "vitest";
import { buildAttendanceCsv, neutralizeSpreadsheetFormula } from "./csv";

describe("attendance CSV safety", () => {
  it("neutralizes spreadsheet formulas in every dangerous prefix", () => {
    for (const value of ["=2+2", "+SUM(A1:A2)", "-10+20", "@IMPORTXML(A1)", "\tcmd", "\rcmd"]) {
      expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`);
    }
    expect(neutralizeSpreadsheetFormula("一般社員")).toBe("一般社員");
  });

  it("exports only the approved attendance columns with CRLF and a UTF-8 BOM", () => {
    const csv = buildAttendanceCsv([{
      event_date: "2026-07-31",
      event_title: "例會",
      member_name: "=2+2",
      final_status: "present",
      raw_checkin_method: "qr",
      raw_checked_in_at: "2026-07-31T12:00:00Z",
      adjustment_type: null,
      adjustment_reason: null,
    }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\"'=2+2\"");
    expect(csv).not.toContain("auth_user_id");
    expect(csv).not.toContain("person_id");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
