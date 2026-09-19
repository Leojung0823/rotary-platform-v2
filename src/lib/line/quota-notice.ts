export type LineOaQuotaNotice = {
  failure_code: "rate_limited";
  created_at: string;
  recipient_count: number;
  batch_count: number;
  sent_batch_count: number;
  delivered_recipient_count: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function parseLineOaQuotaNotice(value: unknown): LineOaQuotaNotice | null {
  if (!isRecord(value)
    || value.failure_code !== "rate_limited"
    || typeof value.created_at !== "string"
    || Number.isNaN(Date.parse(value.created_at))
    || !nonNegativeInteger(value.recipient_count)
    || !nonNegativeInteger(value.batch_count)
    || !nonNegativeInteger(value.sent_batch_count)
    || !nonNegativeInteger(value.delivered_recipient_count)) {
    return null;
  }

  return {
    failure_code: "rate_limited",
    created_at: value.created_at,
    recipient_count: value.recipient_count,
    batch_count: value.batch_count,
    sent_batch_count: value.sent_batch_count,
    delivered_recipient_count: value.delivered_recipient_count,
  };
}

export function describeLineOaQuotaNotice(notice: LineOaQuotaNotice) {
  return `最近一次推播嘗試 ${notice.recipient_count} 位，已送達 ${notice.delivered_recipient_count} 位（${notice.sent_batch_count}/${notice.batch_count} 批）。`;
}
