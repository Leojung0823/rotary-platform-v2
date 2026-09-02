import { afterEach, describe, expect, it, vi } from "vitest";
import { composeMessagePushText } from "./message-center-push";

const evaluateCurrentFeatureFlag = vi.hoisted(() => vi.fn());
const loadClubOaDispatchContext = vi.hoisted(() => vi.fn());
const deliverClubOaText = vi.hoisted(() => vi.fn());

vi.mock("@/lib/product/feature-flag-adapter.server", () => ({ evaluateCurrentFeatureFlag }));
vi.mock("./oa-dispatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./oa-dispatch")>()),
  loadClubOaDispatchContext,
  deliverClubOaText,
}));

const { pushClubMessageToLine } = await import("./message-center-push");

type RpcCall = { name: string; args: Record<string, unknown> };

function supabaseStub(targets: unknown, calls: RpcCall[], targetsError = false) {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "list_club_message_line_targets") {
        return targetsError ? { data: null, error: { message: "denied" } } : { data: targets, error: null };
      }
      return { data: "push-log-id", error: null };
    }),
  } as never;
}

const message = {
  clubId: "11111111-1111-4111-8111-111111111111",
  messageId: "22222222-2222-4222-8222-222222222222",
  title: "本週例會改期",
  body: "改到週四晚上七點。",
};

describe("message centre LINE push", () => {
  afterEach(() => vi.clearAllMocks());

  it("sends nothing at all while the flag is off", async () => {
    evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: false });
    const calls: RpcCall[] = [];

    const outcome = await pushClubMessageToLine({ supabase: supabaseStub([], calls), ...message });

    expect(outcome).toEqual({ status: "skipped", reason: "flag_disabled" });
    expect(calls).toHaveLength(0);
    expect(loadClubOaDispatchContext).not.toHaveBeenCalled();
    expect(deliverClubOaText).not.toHaveBeenCalled();
  });

  it("records no push log when nobody addressed can be reached", async () => {
    evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: true });
    loadClubOaDispatchContext.mockResolvedValue({ ok: true, context: { followers: [] } });
    const calls: RpcCall[] = [];

    const outcome = await pushClubMessageToLine({ supabase: supabaseStub([], calls), ...message });

    expect(outcome).toEqual({ status: "skipped", reason: "no_reachable_recipients" });
    expect(deliverClubOaText).not.toHaveBeenCalled();
    expect(calls.map((call) => call.name)).toEqual(["list_club_message_line_targets"]);
  });

  it("pushes only to the targets the database returned, not to every follower", async () => {
    evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: true });
    // The dispatch context carries every follower of the account; the message
    // was addressed to a subset, and only that subset may be pushed to.
    loadClubOaDispatchContext.mockResolvedValue({
      ok: true,
      context: { followers: ["Uall1", "Uall2", "Uall3"], accessToken: "token" },
    });
    deliverClubOaText.mockResolvedValue({
      status: "sent", batchCount: 1, sentBatchCount: 1, deliveredRecipientCount: 2, requestId: "req-1",
    });
    const calls: RpcCall[] = [];
    const targets = [{ oa_user_id: "Uall1" }, { oa_user_id: "Uall3" }, { oa_user_id: "Uall3" }];

    const outcome = await pushClubMessageToLine({ supabase: supabaseStub(targets, calls), ...message });

    expect(deliverClubOaText).toHaveBeenCalledWith(
      "multicast", ["Uall1", "Uall3"], expect.any(String), expect.anything(),
    );
    expect(outcome).toEqual({ status: "sent", recipientCount: 2 });
  });

  it("records a failed push so the per-message log still blocks a second send", async () => {
    evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: true });
    loadClubOaDispatchContext.mockResolvedValue({ ok: true, context: { followers: [], accessToken: "t" } });
    deliverClubOaText.mockResolvedValue({
      status: "failed", failureCode: "rate_limited", batchCount: 1, sentBatchCount: 0, deliveredRecipientCount: 0,
    });
    const calls: RpcCall[] = [];

    const outcome = await pushClubMessageToLine({
      supabase: supabaseStub([{ oa_user_id: "Uone" }], calls), ...message,
    });

    expect(outcome).toEqual({ status: "failed", reason: "rate_limited" });
    const logged = calls.find((call) => call.name === "record_club_message_line_push");
    expect(logged?.args.p_delivery_status).toBe("failed");
    expect(logged?.args.p_failure_code).toBe("rate_limited");
    expect(logged?.args.p_message_id).toBe(message.messageId);
  });

  it("reports a refused target query rather than pushing to a guessed audience", async () => {
    evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: true });
    loadClubOaDispatchContext.mockResolvedValue({ ok: true, context: { followers: ["Uall1"] } });
    const calls: RpcCall[] = [];

    const outcome = await pushClubMessageToLine({
      supabase: supabaseStub(null, calls, true), ...message,
    });

    expect(outcome).toEqual({ status: "failed", reason: "targets_unavailable" });
    expect(deliverClubOaText).not.toHaveBeenCalled();
  });
});

describe("message centre LINE text", () => {
  it("carries the title, which a plain LINE message does not have", () => {
    expect(composeMessagePushText("例會改期", "改到週四。")).toBe("例會改期\n\n改到週四。");
  });

  it("marks truncation instead of silently cutting the body", () => {
    const text = composeMessagePushText("公告", "字".repeat(2000));
    expect(text.length).toBeLessThan(1100);
    expect(text).toContain("完整內容請到訊息中心查看");
  });
});
