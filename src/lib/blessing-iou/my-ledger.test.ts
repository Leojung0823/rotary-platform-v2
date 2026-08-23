import { describe, expect, it } from "vitest";
import { parseMyBlessingIouLedger, parseRotaryYearFilter } from "./my-ledger";

const clubId = "5b000000-0000-4000-8000-000000000001";
const entryId = "6b000000-0000-4000-8000-000000000001";

function projection(overrides: Record<string, unknown> = {}) {
  return {
    clubs: [{ club_id: clubId, club_code: "IOU", club_name: "測試社", can_manage: false }],
    selected_club_id: clubId,
    current_year: 2026,
    selected_year: 2026,
    available_years: [2026, 2025],
    totals: { entry_count: 1, pledged_total: "3000", collected_total: 1000, outstanding_total: "2000" },
    entries: [{
      entry_id: entryId,
      blessing_text: "生日快樂",
      pledged_amount: "3000",
      currency_code: "TWD",
      amount_is_public: false,
      pledged_on: "2026-07-01",
      collected_amount: "1000",
      outstanding_amount: "2000",
    }],
    ...overrides,
  };
}

describe("member IOU Rotary-year contract", () => {
  it("accepts a caller-only bounded ledger", () => {
    expect(parseMyBlessingIouLedger(projection())?.selected_year).toBe(2026);
  });

  it("accepts the all-years selection", () => {
    expect(parseMyBlessingIouLedger(projection({ selected_year: null }))?.selected_year).toBeNull();
    expect(parseRotaryYearFilter("all")).toBeNull();
  });

  it("normalizes absent and malformed years to the current-year sentinel", () => {
    expect(parseRotaryYearFilter(undefined)).toBe(0);
    expect(parseRotaryYearFilter("not-a-year")).toBe(0);
    expect(parseRotaryYearFilter("2025")).toBe(2025);
  });

  it("rejects malformed identifiers, unbounded rows, and invalid money", () => {
    expect(parseMyBlessingIouLedger(projection({ selected_club_id: "not-a-uuid" }))).toBeNull();
    expect(parseMyBlessingIouLedger(projection({ available_years: Array.from({ length: 31 }, (_, i) => 2026 - i) }))).toBeNull();
    expect(parseMyBlessingIouLedger(projection({ totals: { entry_count: 1, pledged_total: "secret", collected_total: 0, outstanding_total: 0 } }))).toBeNull();
  });
});
