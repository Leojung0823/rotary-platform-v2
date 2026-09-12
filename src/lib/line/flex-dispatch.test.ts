import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./messaging", () => ({ sendLineOaMessage: vi.fn() }));
import { sendLineOaMessage } from "./messaging";
import { buildFlexPushLogArgs, deliverClubOaFlex } from "./flex-dispatch";

const input = {
  kind: "multicast" as const, recipients: ["selected-recipient"],
  context: { accessToken: "test-club-only-token", followers: ["must-not-expand-audience"] },
  template: "event" as const, senderName: "測試社", title: "例會", message: "本週五見",
};
const delivered = { status: "mocked" as const, batchCount: 1, sentBatchCount: 1, deliveredRecipientCount: 1 };

describe("Flex dispatch", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps the resolved audience and current club credentials without broadening", async () => {
    vi.mocked(sendLineOaMessage).mockResolvedValue(delivered);
    expect(await deliverClubOaFlex(input)).toEqual(delivered);
    expect(sendLineOaMessage).toHaveBeenCalledWith("multicast", input.recipients,
      [expect.objectContaining({ type: "flex" })], { accessToken: input.context.accessToken });
  });

  it("rejects invalid content before any provider request", async () => {
    await expect(deliverClubOaFlex({ ...input, title: " " })).rejects.toThrow("invalid_flex_text");
    expect(sendLineOaMessage).not.toHaveBeenCalled();
  });

  it("does not expose provider exceptions or credentials", async () => {
    vi.mocked(sendLineOaMessage).mockRejectedValue(new Error("sensitive provider diagnostic"));
    const result = await deliverClubOaFlex(input);
    expect(result).toEqual({ status: "failed", failureCode: "provider_error", batchCount: 0, sentBatchCount: 0, deliveredRecipientCount: 0 });
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });

  it("retains partial delivery details without logging message content", () => {
    const args = buildFlexPushLogArgs({ clubId: "selected-club", kind: "multicast", recipientCount: 700,
      template: "event", title: input.title, message: input.message,
      delivery: { status: "failed", failureCode: "rate_limited", batchCount: 2, sentBatchCount: 1, deliveredRecipientCount: 500 },
    });
    expect(args.p_payload_summary).toMatchObject({ message_type: "flex", template_key: "event", delivered_recipient_count: 500, sent_batch_count: 1 });
    expect(args.p_failure_code).toBe("rate_limited");
    expect(JSON.stringify(args)).not.toContain(input.message);
    expect(JSON.stringify(args)).not.toContain(input.context.accessToken);
  });
});
