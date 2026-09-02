import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPushLogArgs } from "./oa-dispatch";

describe("LINE OA dispatch logging", () => {
  it("keeps a partial delivery visible even though the status column cannot say so", () => {
    const args = buildPushLogArgs("club-id", "multicast", 501, "測試訊息", {
      status: "failed",
      failureCode: "rate_limited",
      retryAfterSeconds: 30,
      batchCount: 2,
      sentBatchCount: 1,
      deliveredRecipientCount: 500,
    });

    expect(args).toMatchObject({
      p_delivery_status: "failed",
      p_failure_code: "rate_limited",
      p_recipient_count: 501,
    });
    expect(args.p_payload_summary).toMatchObject({
      batch_count: 2,
      sent_batch_count: 1,
      delivered_recipient_count: 500,
      character_count: 4,
    });
  });

  it("records no failure code for a delivery that succeeded", () => {
    const args = buildPushLogArgs("club-id", "broadcast", 0, "測試", {
      status: "sent",
      requestId: "req-1",
      batchCount: 1,
      sentBatchCount: 1,
      deliveredRecipientCount: 0,
    });
    expect(args.p_failure_code).toBeNull();
    expect(args.p_provider_request_id).toBe("req-1");
  });

  it("falls back to a generic failure code rather than reporting a success", () => {
    const args = buildPushLogArgs("club-id", "broadcast", 0, "測試", {
      status: "failed",
      batchCount: 0,
      sentBatchCount: 0,
      deliveredRecipientCount: 0,
    });
    expect(args.p_failure_code).toBe("provider_error");
  });
});

describe("LINE OA dispatch boundary", () => {
  const callSites = ["src/app/line-oa-actions.ts", "src/app/api/v1/[...path]/route.ts"];

  it("routes every club push through the shared dispatch module", () => {
    for (const file of callSites) {
      const source = readFileSync(file, "utf8");
      // Two independent copies of this flow drifted before; the audience-aware
      // one targeted a tag while the other silently sent to every follower.
      expect(source).toContain("loadClubOaDispatchContext");
      expect(source).toContain("buildPushLogArgs");
      expect(source).not.toContain("sendLineOaMessage");
      expect(source).not.toContain("readServerSecret");
    }
  });
});
