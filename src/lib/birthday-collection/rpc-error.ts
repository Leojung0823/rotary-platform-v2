export type BirthdayCollectionRpcErrorCode =
  | "question_bank_exhausted"
  | "invalid_question"
  | "duplicate_question"
  | "campaign_already_exists"
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "already_published"
  | "not_ready"
  | "reason_required"
  | "already_ended"
  | "unexpected";

/** Map database errors to bounded messages without exposing SQL details. */
export function birthdayCollectionRpcErrorCode(message: unknown): BirthdayCollectionRpcErrorCode {
  const value = typeof message === "string" ? message : "";
  if (value.includes("question_bank_exhausted")) return "question_bank_exhausted";
  if (value.includes("invalid_birthday_question")) return "invalid_question";
  if (value.includes("birthday_campaign_recipient_year_unique")) return "campaign_already_exists";
  if (value.includes("duplicate") || value.includes("23505")) return "duplicate_question";
  if (value.includes("invalid_birthday_assignment_period") || value.includes("invalid_birthday_wish_content")) return "invalid_input";
  if (value.includes("birthday_submission_not_found") || value.includes("birthday_club_question_not_found")) return "not_found";
  // Before the generic "required" rule below, which would otherwise read
  // 「請寫下原因」 as 「沒有權限」 -- the code contains the word.
  if (value.includes("campaign_close_reason_required")) return "reason_required";
  if (value.includes("campaign_already_ended")) return "already_ended";
  if (value.includes("campaign_not_available")) return "not_found";
  if (value.includes("invalid_campaign_date")) return "invalid_input";
  if (value.includes("required") || value.includes("42501")) return "forbidden";
  if (value.includes("assignment_not_available") || value.includes("author_mismatch")) return "forbidden";
  if (value.includes("published")) return "already_published";
  if (
    value.includes("not_ready")
    || value.includes("submission_closed")
    || value.includes("campaign_submission_closed")
    || value.includes("already_started")
    || value.includes("batch_not_open")
    || value.includes("campaign_not_open")
    || value.includes("assignment_batch_not_complete")
  ) return "not_ready";
  return "unexpected";
}
