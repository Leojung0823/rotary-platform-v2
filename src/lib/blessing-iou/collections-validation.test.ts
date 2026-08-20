import { describe, expect, it } from "vitest";
import {
  parseCollectionBatchBody,
  parseCollectionPeriodMonth,
  parseCollectionReversalBody,
} from "./collections-validation";

const entryId = "5a000000-0000-4000-8000-000000000001";

describe("blessing IOU collection validation", () => {
  it("normalizes a valid single or batch collection", () => {
    expect(parseCollectionBatchBody({
      periodMonth: "2026-08",
      receivedOn: "2026-08-19",
      paymentMethod: "transfer",
      referenceNote: "  末五碼 12345  ",
      items: [{ entryId, amount: 500 }],
    })).toEqual({
      periodMonth: "2026-08-01",
      receivedOn: "2026-08-19",
      paymentMethod: "transfer",
      referenceNote: "末五碼 12345",
      items: [{ entry_id: entryId, amount: 500 }],
    });
  });

  it("rejects invalid calendar months and dates", () => {
    expect(() => parseCollectionPeriodMonth("2026-13")).toThrow();
    expect(() => parseCollectionBatchBody({
      periodMonth: "2026-08",
      receivedOn: "2026-02-30",
      paymentMethod: "cash",
      referenceNote: null,
      items: [{ entryId, amount: 500 }],
    })).toThrow();
  });

  it("rejects duplicate entries, fractional money, and extra keys", () => {
    const base = {
      periodMonth: "2026-08",
      receivedOn: "2026-08-19",
      paymentMethod: "cash",
      referenceNote: null,
    };
    expect(() => parseCollectionBatchBody({
      ...base,
      items: [{ entryId, amount: 500 }, { entryId, amount: 200 }],
    })).toThrow();
    expect(() => parseCollectionBatchBody({
      ...base,
      items: [{ entryId, amount: 10.5 }],
    })).toThrow();
    expect(() => parseCollectionBatchBody({ ...base, items: [{ entryId, amount: 10 }], role: "admin" })).toThrow();
  });

  it("requires a bounded reversal reason", () => {
    expect(parseCollectionReversalBody({ periodMonth: "2026-08", reason: "  重複登錄  " }))
      .toEqual({ periodMonth: "2026-08-01", reason: "重複登錄" });
    expect(() => parseCollectionReversalBody({ periodMonth: "2026-08", reason: "錯" })).toThrow();
  });
});
