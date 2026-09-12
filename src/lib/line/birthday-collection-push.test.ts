import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const loadClubOaDispatchContext = vi.hoisted(() => vi.fn());
const deliverClubOaText = vi.hoisted(() => vi.fn());

vi.mock("./oa-dispatch", () => ({
  loadClubOaDispatchContext,
  deliverClubOaText,
}));

const { pushBirthdayCollectionNotifications, resolveInvitationLink, composeBirthdayInvitationText } = await import("./birthday-collection-push");

const clubId = "11111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";

function flagQuery(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(async () => ({ data, error })),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

function supabaseStub(flag: unknown, jobs: unknown, calls: Array<{ name: string; args?: unknown }> = []) {
  const rpc = vi.fn(async (name: string, args?: unknown) => {
    calls.push({ name, args });
    if (name === "list_birthday_collection_line_push_jobs") return { data: jobs, error: null };
    return { data: "push-log-id", error: null };
  });
  return {
    from: vi.fn(() => flagQuery(flag)),
    rpc,
  } as unknown as SupabaseClient & { rpc: typeof rpc };
}

describe("birthday collection LINE push", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("does not query birthday jobs when the event-push flag is not enabled", async () => {
    vi.stubEnv("APP_ENV", "staging");
    const supabase = supabaseStub(null, []);

    const outcome = await pushBirthdayCollectionNotifications(supabase);

    expect(outcome).toEqual({ status: "skipped", jobCount: 0, sentCount: 0, failedCount: 0 });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("sends each pending birthday message to the database-resolved recipients", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("LINE_OA_MODE", "mock");
    const calls: Array<{ name: string; args?: unknown }> = [];
    const supabase = supabaseStub({
      feature_key: "line_oa_event_push_v1",
      enabled: true,
      enabled_environments: ["staging"],
      rollout_percentage: 100,
    }, [{
      club_id: clubId,
      message_id: messageId,
      title: "本月生日祝福任務",
      body: "請完成一則生日祝福。",
      oa_user_ids: ["Uone", "Uone", "Utwo"],
    }], calls);
    loadClubOaDispatchContext.mockResolvedValue({ ok: true, context: { followers: [] } });
    deliverClubOaText.mockResolvedValue({
      status: "sent", batchCount: 1, sentBatchCount: 1, deliveredRecipientCount: 2,
    });

    const outcome = await pushBirthdayCollectionNotifications(supabase);

    expect(outcome).toEqual({ status: "sent", jobCount: 1, sentCount: 1, failedCount: 0 });
    expect(deliverClubOaText).toHaveBeenCalledWith(
      "multicast", ["Uone", "Utwo"], expect.stringContaining("本月生日祝福任務"), expect.anything(),
    );
    expect(calls.map((call) => call.name)).toEqual([
      "list_birthday_collection_line_push_jobs",
      "record_birthday_collection_line_push",
    ]);
    expect(calls[1]?.args).toMatchObject({
      p_club_id: clubId,
      p_message_id: messageId,
      p_recipient_count: 2,
      p_delivery_status: "sent",
    });
  });

  it("keeps a failed provider result visible to the scheduler caller", async () => {
    vi.stubEnv("APP_ENV", "staging");
    const supabase = supabaseStub({
      feature_key: "line_oa_event_push_v1",
      enabled: true,
      enabled_environments: ["staging"],
      rollout_percentage: 100,
    }, [{
      club_id: clubId,
      message_id: messageId,
      title: "任務",
      body: "內容",
      oa_user_ids: ["Uone"],
    }]);
    loadClubOaDispatchContext.mockResolvedValue({ ok: true, context: { followers: [] } });
    deliverClubOaText.mockResolvedValue({
      status: "failed", failureCode: "rate_limited", batchCount: 1, sentBatchCount: 0,
      deliveredRecipientCount: 0,
    });

    const outcome = await pushBirthdayCollectionNotifications(supabase);

    expect(outcome).toEqual({ status: "failed", jobCount: 1, sentCount: 0, failedCount: 1 });
  });
});

describe("birthday invitation link", () => {
  const hosted = { APP_ENV: "staging", NEXT_PUBLIC_SITE_URL: "https://club.example.com" };

  it("builds an absolute link from the in-app action path", () => {
    expect(resolveInvitationLink("/birthday-collection?clubId=abc", hosted))
      .toBe("https://club.example.com/birthday-collection?clubId=abc");
  });

  it("refuses a protocol-relative path that would resolve to another site", () => {
    expect(resolveInvitationLink("//evil.example.net/steal", hosted)).toBeNull();
  });

  it("refuses an absolute external URL", () => {
    expect(resolveInvitationLink("https://evil.example.net/steal", hosted)).toBeNull();
  });

  it("drops the link rather than throwing when the site origin is unusable", () => {
    expect(resolveInvitationLink("/birthday-collection", { APP_ENV: "staging" })).toBeNull();
  });

  it("drops the link when there is no action path", () => {
    expect(resolveInvitationLink(null, hosted)).toBeNull();
  });

  it("appends the link below the message text", () => {
    expect(composeBirthdayInvitationText("標題", "內文", "https://club.example.com/x"))
      .toBe("標題\n\n內文\n\nhttps://club.example.com/x");
  });

  it("sends the message unchanged when there is no link", () => {
    expect(composeBirthdayInvitationText("標題", "內文", null)).toBe("標題\n\n內文");
  });
});
