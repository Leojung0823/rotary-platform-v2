import { describe, expect, it } from "vitest";
import { parseDuesFinanceMutationBody } from "./validation";

const clubId = "10000000-0000-4000-8000-000000000001";
const yearId = "20000000-0000-4000-8000-000000000001";
const receivableId = "30000000-0000-4000-8000-000000000001";

describe("dues finance mutation validation", () => {
  it("normalizes a valid receipt request and rejects duplicate allocations", () => {
    expect(parseDuesFinanceMutationBody({
      action: "record_receipt",
      clubId: clubId.toUpperCase(),
      receivedOn: "2026-09-14",
      paymentMethod: "bank_transfer",
      referenceNote: "末五碼 12345",
      allocations: [{ receivableId, amount: "600" }],
      idempotencyKey: "receipt-1",
    })).toEqual(expect.objectContaining({ clubId, allocations: [{ receivableId, amount: 600 }] }));
    expect(() => parseDuesFinanceMutationBody({
      action: "record_receipt",
      clubId,
      receivedOn: "2026-09-14",
      paymentMethod: "cash",
      referenceNote: null,
      allocations: [{ receivableId, amount: 100 }, { receivableId, amount: 200 }],
      idempotencyKey: "receipt-duplicate",
    })).toThrow("invalid_dues_finance_input");
  });

  it("rejects zero adjustments, impossible dates, and unknown fields", () => {
    expect(() => parseDuesFinanceMutationBody({
      action: "adjust_receivable",
      clubId,
      receivableId,
      amountDelta: 0,
      reason: "不調整",
      idempotencyKey: "adjust-1",
    })).toThrow("invalid_dues_finance_input");
    expect(() => parseDuesFinanceMutationBody({
      action: "submit_advance",
      clubId,
      rotaryYearId: yearId,
      payerMembershipId: null,
      amount: 100,
      description: "活動用品",
      incurredOn: "2026-02-30",
      idempotencyKey: "advance-1",
    })).toThrow("invalid_dues_finance_input");
    expect(() => parseDuesFinanceMutationBody({
      action: "generate_receivables",
      clubId,
      rotaryYearId: yearId,
      sourceNote: null,
      unexpected: true,
    })).toThrow("invalid_dues_finance_input");
  });
});
