import { describe, expect, it } from "vitest";
import { parseDuesFinanceMemberLedger } from "./contracts";

const clubId = "10000000-0000-4000-8000-000000000001";
const yearId = "20000000-0000-4000-8000-000000000001";
const advanceId = "30000000-0000-4000-8000-000000000001";
const membershipId = "40000000-0000-4000-8000-000000000001";
const reconciliationId = "50000000-0000-4000-8000-000000000001";

function advance(overrides: Record<string, unknown> = {}) {
  return {
    advance_id: advanceId,
    club_id: clubId,
    rotary_year_id: yearId,
    payer_membership_id: membershipId,
    payer_display_name: "測試社員",
    amount: 1000,
    reconciled_amount: 300,
    outstanding_amount: 700,
    advance_status: "submitted",
    submission_count: 1,
    description: "活動用品",
    incurred_on: "2026-09-14",
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
    reconciliations: [{
      reconciliation_id: reconciliationId,
      amount: 300,
      approval_note: null,
      approved_at: "2026-09-14T00:00:00.000Z",
      status: "posted",
      reversal_reason: null,
    }],
    ...overrides,
  };
}

function ledger(item: Record<string, unknown>) {
  return {
    club_id: clubId,
    rotary_year_id: yearId,
    rotary_year_start: 2026,
    receivables: [],
    receipts: [],
    advances: [item],
  };
}

describe("dues finance projection contracts", () => {
  it("accepts a balanced advance projection", () => {
    expect(parseDuesFinanceMemberLedger(ledger(advance())).advances[0]).toEqual(expect.objectContaining({
      amount: 1000,
      reconciledAmount: 300,
      outstandingAmount: 700,
    }));
  });

  it("rejects advance totals that disagree with posted reconciliation details", () => {
    expect(() => parseDuesFinanceMemberLedger(ledger(advance({ reconciled_amount: 0 })))).toThrow(
      "invalid_dues_finance_projection",
    );
  });

  it("rejects a closed advance that still has an outstanding balance", () => {
    expect(() => parseDuesFinanceMemberLedger(ledger(advance({ advance_status: "closed" })))).toThrow(
      "invalid_dues_finance_projection",
    );
  });
});
