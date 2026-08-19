import { describe, expect, it } from "vitest";
import { parseBlessingIouRotaryYearReport } from "./reporting-contracts";

const months = Array.from({ length: 12 }, (_, index) => {
  const month = new Date(Date.UTC(2026, 6 + index, 1)).toISOString().slice(0, 7);
  return {
    month,
    entry_count: index === 0 ? 1 : 0,
    member_count: index === 0 ? 1 : 0,
    pledged_amount: index === 0 ? 1000 : 0,
    received_amount: index === 0 ? 400 : 0,
    outstanding_amount: index === 0 ? 600 : 0,
  };
});

const report = {
  club_id: "4b000000-0000-4000-8000-000000000001",
  club_code: "REPORT",
  club_name: "報表測試社",
  rotary_year_start: 2026,
  rotary_year_label: "2026-27",
  starts_on: "2026-07-01",
  ends_on: "2027-06-30",
  currency_code: "TWD",
  summary: {
    entry_count: 1,
    member_count: 1,
    pledged_amount: 1000,
    received_amount: 400,
    outstanding_amount: 600,
    unpaid_entry_count: 0,
    partial_entry_count: 1,
    paid_entry_count: 0,
  },
  months,
  members: [{
    author_membership_id: "5b000000-0000-4000-8000-000000000001",
    author_display_name: "社員甲",
    entry_count: 1,
    pledged_amount: 1000,
    received_amount: 400,
    outstanding_amount: 600,
    unpaid_entry_count: 0,
    partial_entry_count: 1,
    paid_entry_count: 0,
  }],
};

describe("blessing IOU Rotary-year report projection", () => {
  it("accepts a complete July-to-June report", () => {
    const parsed = parseBlessingIouRotaryYearReport(report);
    expect(parsed.rotaryYearLabel).toBe("2026-27");
    expect(parsed.months).toHaveLength(12);
    expect(parsed.summary.outstandingAmount).toBe(600);
  });

  it("rejects a calendar-year axis or inconsistent totals", () => {
    expect(() => parseBlessingIouRotaryYearReport({
      ...report,
      months: [{ ...months[0], month: "2026-01" }, ...months.slice(1)],
    })).toThrow();
    expect(() => parseBlessingIouRotaryYearReport({
      ...report,
      summary: { ...report.summary, outstanding_amount: 500 },
    })).toThrow();
  });

  it("rejects duplicate members and malformed year labels", () => {
    expect(() => parseBlessingIouRotaryYearReport({
      ...report,
      summary: { ...report.summary, member_count: 2, entry_count: 2, pledged_amount: 2000, received_amount: 800, outstanding_amount: 1200, partial_entry_count: 2 },
      months: months.map((month, index) => index === 0 ? { ...month, entry_count: 2, pledged_amount: 2000, received_amount: 800, outstanding_amount: 1200 } : month),
      members: [report.members[0], report.members[0]],
    })).toThrow();
    expect(() => parseBlessingIouRotaryYearReport({ ...report, rotary_year_label: "2026" })).toThrow();
  });

  it("rejects a status breakdown that disagrees with member totals", () => {
    expect(() => parseBlessingIouRotaryYearReport({
      ...report,
      summary: {
        ...report.summary,
        unpaid_entry_count: 1,
        partial_entry_count: 0,
      },
    })).toThrow();
  });
});
