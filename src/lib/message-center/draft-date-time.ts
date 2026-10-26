export type MessageDraftIntent = "save" | "schedule" | "publish";

type DateTimeResult = { ok: true; value: string } | { ok: false };

function localDateTimeToIso(value: string): DateTimeResult {
  if (value === "") return { ok: true, value: "" };

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { ok: false };
  return { ok: true, value: date.toISOString() };
}

export type MessageDraftDateTimes =
  | { ok: true; expiresAt: string; scheduledAt: string }
  | { ok: false };

export function normalizeMessageDraftDateTimes(
  expiresLocal: string,
  scheduledLocal: string,
  intent: MessageDraftIntent,
): MessageDraftDateTimes {
  const expiresAt = localDateTimeToIso(expiresLocal);
  const scheduledAt = intent === "schedule"
    ? localDateTimeToIso(scheduledLocal)
    : { ok: true as const, value: "" };

  if (!expiresAt.ok || !scheduledAt.ok || (intent === "schedule" && !scheduledAt.value)) {
    return { ok: false };
  }

  return { ok: true, expiresAt: expiresAt.value, scheduledAt: scheduledAt.value };
}
