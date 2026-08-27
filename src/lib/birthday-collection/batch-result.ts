export type BirthdayCollectionBatchStatus = "completed" | "failed";

/**
 * The generation RPC is expected to return only terminal batch states. Keep
 * the browser-facing action fail-closed if a stale or incompatible database
 * returns an in-progress or otherwise malformed result.
 */
export function birthdayCollectionBatchStatus(value: unknown): BirthdayCollectionBatchStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const status = (value as Record<string, unknown>).batch_status;
  return status === "completed" || status === "failed" ? status : null;
}
