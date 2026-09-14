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

  it("distinguishes an existing annual campaign from a duplicate question", () => {
    expect(birthdayCollectionRpcErrorCode("duplicate key birthday_campaign_recipient_year_unique")).toBe("campaign_already_exists");
    expect(birthdayCollectionRpcErrorCode("23505 birthday_campaign_recipient_year_unique")).toBe("campaign_already_exists");
  });

  it("maps bounded input and missing-record failures", () => {
    expect(birthdayCollectionRpcErrorCode("invalid_birthday_assignment_period")).toBe("invalid_input");
    expect(birthdayCollectionRpcErrorCode("invalid_birthday_wish_content")).toBe("invalid_input");
    expect(birthdayCollectionRpcErrorCode("birthday_submission_not_found")).toBe("not_found");
    expect(birthdayCollectionRpcErrorCode("birthday_club_question_not_found")).toBe("not_found");
  });

  it("preserves the existing bounded classifications", () => {
    expect(birthdayCollectionRpcErrorCode("question_bank_exhausted")).toBe("question_bank_exhausted");
    expect(birthdayCollectionRpcErrorCode("23505 duplicate key")).toBe("duplicate_question");
    expect(birthdayCollectionRpcErrorCode("unknown database error")).toBe("unexpected");
  });
});
