export type BirthdayCollectionGenerationSuccessCode =
  | "generated"
  | "generated_notification_skipped";

function status(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).status;
  return typeof candidate === "string" ? candidate : null;
}

/**
 * Converts the protected notification RPC result into a user-facing result.
 * Unknown or failed results stay errors so a stale/incompatible database cannot
 * be reported as a successful invitation.
 */
export function birthdayCollectionGenerationSuccessCode(
  value: unknown,
): BirthdayCollectionGenerationSuccessCode | null {
  switch (status(value)) {
    case "sent":
    case "no_recipients":
      return "generated";
    case "skipped":
      return "generated_notification_skipped";
    default:
      return null;
  }
}
