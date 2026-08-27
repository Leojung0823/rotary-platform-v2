import { describe, expect, it } from "vitest";
import { birthdayCollectionRpcErrorCode } from "./rpc-error";

describe("birthday collection RPC error mapping", () => {
  it("keeps sensitive and permission failures bounded", () => {
    expect(birthdayCollectionRpcErrorCode("birthday_collection_manager_required")).toBe("forbidden");
    expect(birthdayCollectionRpcErrorCode("42501 permission denied: internal detail")).toBe("forbidden");
  });

  it("maps closed or not-open states to an actionable not-ready message", () => {
    expect(birthdayCollectionRpcErrorCode("birthday_campaign_submission_closed")).toBe("not_ready");
    expect(birthdayCollectionRpcErrorCode("birthday_assignment_batch_not_open")).toBe("not_ready");
    expect(birthdayCollectionRpcErrorCode("birthday_campaign_not_open")).toBe("not_ready");
    expect(birthdayCollectionRpcErrorCode("birthday_assignment_batch_not_complete")).toBe("not_ready");
  });

  it("preserves the existing bounded classifications", () => {
    expect(birthdayCollectionRpcErrorCode("question_bank_exhausted")).toBe("question_bank_exhausted");
    expect(birthdayCollectionRpcErrorCode("23505 duplicate key")).toBe("duplicate_question");
    expect(birthdayCollectionRpcErrorCode("unknown database error")).toBe("unexpected");
  });
});
