import { describe, expect, it } from "vitest";
import { describeLineOaQuotaNotice, parseLineOaQuotaNotice } from "./quota-notice";

describe("LINE OA quota notices", () => {
  it("accepts the bounded server projection", () => {
    const notice = parseLineOaQuotaNotice({
      failure_code: "rate_limited",
      created_at: "2026-09-19T01:02:03.000Z",
      recipient_count: 700,
      batch_count: 2,
      sent_batch_count: 1,
      delivered_recipient_count: 500,
    });

    expect(notice).not.toBeNull();
    expect(describeLineOaQuotaNotice(notice!)).toContain("已送達 500 位");
  });

  it("does not turn another failure or malformed data into a quota alert", () => {
    expect(parseLineOaQuotaNotice(null)).toBeNull();
    expect(parseLineOaQuotaNotice({
      failure_code: "provider_error",
      created_at: "2026-09-19T01:02:03.000Z",
      recipient_count: 1,
      batch_count: 1,
      sent_batch_count: 0,
      delivered_recipient_count: 0,
    })).toBeNull();
    expect(parseLineOaQuotaNotice({
      failure_code: "rate_limited",
      created_at: "not-a-date",
      recipient_count: -1,
      batch_count: 1,
      sent_batch_count: 0,
      delivered_recipient_count: 0,
    })).toBeNull();
  });
});
