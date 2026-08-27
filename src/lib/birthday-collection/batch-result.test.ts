import { describe, expect, it } from "vitest";
import { birthdayCollectionBatchStatus } from "./batch-result";

describe("birthdayCollectionBatchStatus", () => {
  it("accepts only terminal completed and failed states", () => {
    expect(birthdayCollectionBatchStatus({ batch_status: "completed" })).toBe("completed");
    expect(birthdayCollectionBatchStatus({ batch_status: "failed" })).toBe("failed");
  });

  it("rejects in-progress and unknown states", () => {
    expect(birthdayCollectionBatchStatus({ batch_status: "planned" })).toBeNull();
    expect(birthdayCollectionBatchStatus({ batch_status: "assigning" })).toBeNull();
    expect(birthdayCollectionBatchStatus({ batch_status: "unexpected" })).toBeNull();
  });

  it("rejects malformed RPC data", () => {
    expect(birthdayCollectionBatchStatus(null)).toBeNull();
    expect(birthdayCollectionBatchStatus([])).toBeNull();
    expect(birthdayCollectionBatchStatus("completed")).toBeNull();
  });
});
