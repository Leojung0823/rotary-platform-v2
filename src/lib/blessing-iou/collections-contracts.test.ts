import { describe, expect, it } from "vitest";
import { parseBlessingIouCollectionContext } from "./collections-contracts";

const base = {
  club_id: "4a000000-0000-4000-8000-000000000001",
  club_code: "TEST",
  club_name: "測試社",
  period_month: "2026-08",
  currency_code: "TWD",
  summary: {
    pledged_amount: 3000,
    received_amount: 1000,
    outstanding_amount: 2000,
    entry_count: 1,
    unpaid_entry_count: 0,
    partial_entry_count: 1,
    paid_entry_count: 0,
  },
  entries: [{
    entry_id: "5a000000-0000-4000-8000-000000000001",
    author_membership_id: "6a000000-0000-4000-8000-000000000001",
    author_display_name: "測試社員",
    blessing_text: "祝福大家",
    pledged_on: "2026-08-19",
    created_at: "2026-08-19T00:00:00.000Z",
    pledged_amount: 3000,
    received_amount: 1000,
    outstanding_amount: 2000,
    collection_status: "partial",
  }],
  collections: [{
    collection_id: "7a000000-0000-4000-8000-000000000001",
    entry_id: "5a000000-0000-4000-8000-000000000001",
    author_display_name: "測試社員",
    amount_received: 1000,
    received_on: "2026-08-19",
    payment_method: "cash",
    reference_note: null,
    collection_status: "posted",
    created_at: "2026-08-19T01:00:00.000Z",
    reversed_at: null,
    reversal_reason: null,
  }],
};

describe("blessing IOU collection projection", () => {
  it("accepts a consistent partial-collection context", () => {
    const parsed = parseBlessingIouCollectionContext(base);
    expect(parsed.summary.outstandingAmount).toBe(2000);
    expect(parsed.entries[0].collectionStatus).toBe("partial");
  });

  it("rejects inconsistent money and status projections", () => {
    expect(() => parseBlessingIouCollectionContext({
      ...base,
      entries: [{ ...base.entries[0], outstanding_amount: 1000 }],
    })).toThrow();
    expect(() => parseBlessingIouCollectionContext({
      ...base,
      entries: [{ ...base.entries[0], collection_status: "paid" }],
    })).toThrow();
  });

  it("requires reversal fields only on reversed records", () => {
    expect(() => parseBlessingIouCollectionContext({
      ...base,
      collections: [{ ...base.collections[0], reversed_at: "2026-08-20T00:00:00.000Z" }],
    })).toThrow();
    expect(parseBlessingIouCollectionContext({
      ...base,
      collections: [{
        ...base.collections[0],
        collection_status: "reversed",
        reversed_at: "2026-08-20T00:00:00.000Z",
        reversal_reason: "重複登錄",
      }],
    }).collections[0].collectionStatus).toBe("reversed");
  });
});
