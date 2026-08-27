export type BirthdayCollectionRpcErrorCode =
  | "question_bank_exhausted"
  | "invalid_question"
  | "duplicate_question"
  | "forbidden"
  | "already_published"
  | "not_ready"
  | "unexpected";

/** Map database errors to bounded messages without exposing SQL details. */
export function birthdayCollectionRpcErrorCode(message: unknown): BirthdayCollectionRpcErrorCode {
  const value = typeof message === "string" ? message : "";
  if (value.includes("question_bank_exhausted")) return "question_bank_exhausted";
  if (value.includes("invalid_birthday_question")) return "invalid_question";
  if (value.includes("duplicate") || value.includes("23505")) return "duplicate_question";
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
