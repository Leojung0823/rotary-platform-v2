import { describe, expect, it } from "vitest";
import { describeMessagePushOutcome } from "./message-push-outcome";

describe("message centre LINE push reporting", () => {
  it("says nothing extra when the feature is off", () => {
    expect(describeMessagePushOutcome({ status: "skipped", reason: "flag_disabled" })).toBe("");
    expect(describeMessagePushOutcome(undefined)).toBe("");
  });

  it("always states a failure, because silence reads as delivered", () => {
    const notice = describeMessagePushOutcome({ status: "failed", reason: "rate_limited" });
    expect(notice).toContain("沒有成功");
    expect(notice).toContain("訊息仍在訊息中心");
  });

  it("separates nobody-reachable from a failure", () => {
    expect(describeMessagePushOutcome({ status: "skipped", reason: "no_reachable_recipients" }))
      .toContain("沒有人加入官方帳號");
    expect(describeMessagePushOutcome({ status: "skipped", reason: "oa_not_configured" }))
      .toContain("尚未設定 LINE 官方帳號");
  });

  it("reports how many members the push reached", () => {
    expect(describeMessagePushOutcome({ status: "sent", recipientCount: 12 })).toContain("12 位社員");
  });

  it("never leaks a provider failure code to the officer", () => {
    expect(describeMessagePushOutcome({ status: "failed", reason: "credentials_rejected" }))
      .not.toContain("credentials_rejected");
  });
});
