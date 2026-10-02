import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const loadClubOaDispatchContext = vi.hoisted(() => vi.fn());
const sendLineOaMessage = vi.hoisted(() => vi.fn());

vi.mock("./oa-dispatch", () => ({ loadClubOaDispatchContext }));
vi.mock("./messaging", () => ({ sendLineOaMessage }));

const {
  composeJoyIouReminderText,
  pushJoyIouDeadlineReminders,
} = await import("./joy-iou-deadline-reminders");

const clubId = "11111111-1111-4111-8111-111111111111";
const otherClubId = "22222222-2222-4222-8222-222222222222";

function job(overrides: Record<string, unknown> = {}) {
  return {
    reminder_id: "33333333-3333-4333-8333-333333333333",
    club_id: clubId,
    recipient_membership_id: "44444444-4444-4444-8444-444444444444",
    recipient_app_account_id: "55555555-5555-4555-8555-555555555555",
    oa_user_id: "Urecipient",
    reminder_kind: "due_today",
    notification_date: "2026-10-03",
    actionable_count: 1,
    ...overrides,
  };
}

function supabaseStub(jobs: unknown[], calls: Array<{ name: string; args?: unknown }> = []) {
  const rpc = vi.fn(async (name: string, args?: unknown) => {
    calls.push({ name, args });
    if (name === "run_joy_iou_deadline_reminder_scheduler") return { data: jobs, error: null };
    return { data: "ok", error: null };
  });
  return { rpc } as unknown as SupabaseClient & { rpc: typeof rpc };
}

describe("Joy IOU deadline reminder delivery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("uses generic wording and a same-origin link without private IOU details", () => {
    const text = composeJoyIouReminderText(
      "overdue",
      3,
      clubId,
      { APP_ENV: "staging", NEXT_PUBLIC_SITE_URL: "https://rotary.example.com" },
    );
    expect(text).toContain("3筆非金錢承諾已逾期");
    expect(text).toContain("https://rotary.example.com/joy?clubId=");
    expect(text).not.toContain("承諾內容");
    expect(text).not.toContain("收件者姓名");
  });

  it("does not call the scheduler outside staging", async () => {
    vi.stubEnv("APP_ENV", "production");
    const supabase = supabaseStub([]);
    await expect(pushJoyIouDeadlineReminders(supabase)).resolves.toMatchObject({
      status: "completed", jobCount: 0,
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("sends only to the resolved active follower and records a sanitized log", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://rotary.example");
    loadClubOaDispatchContext.mockResolvedValue({
      ok: true,
      context: { followers: ["Urecipient"], accessToken: "server-only-token" },
    });
    sendLineOaMessage.mockResolvedValue({
      status: "sent", requestId: "req-123", batchCount: 1, sentBatchCount: 1,
      deliveredRecipientCount: 1,
    });
    const calls: Array<{ name: string; args?: unknown }> = [];
    const supabase = supabaseStub([job({ actionable_count: 2 })], calls);

    const result = await pushJoyIouDeadlineReminders(supabase, "2026-10-03T04:00:00.000Z");

    expect(result).toMatchObject({ status: "completed", jobCount: 1, sentCount: 1 });
    expect(sendLineOaMessage).toHaveBeenCalledWith(
      "push",
      ["Urecipient"],
      [{ type: "text", text: expect.stringContaining("2筆非金錢承諾今天到期") }],
      { accessToken: "server-only-token" },
    );
    const record = calls.find((call) => call.name === "record_joy_iou_deadline_reminder_delivery");
    expect(record?.args).toMatchObject({
      p_reminder_id: job().reminder_id,
      p_delivery_status: "sent",
      p_provider_request_id: "req-123",
    });
    expect(JSON.stringify(record?.args)).not.toContain("server-only-token");
  });

  it("skips a follower that is no longer in the club dispatch context", async () => {
    vi.stubEnv("APP_ENV", "staging");
    loadClubOaDispatchContext.mockResolvedValue({
      ok: true, context: { followers: [], accessToken: "token" },
    });
    const calls: Array<{ name: string; args?: unknown }> = [];
    const supabase = supabaseStub([job()], calls);

    const result = await pushJoyIouDeadlineReminders(supabase);

    expect(result).toMatchObject({ skippedCount: 1, sentCount: 0 });
    expect(sendLineOaMessage).not.toHaveBeenCalled();
    expect(calls.find((call) => call.name === "skip_joy_iou_deadline_reminder")?.args)
      .toEqual({ p_reminder_id: job().reminder_id, p_failure_code: "recipient_unavailable" });
  });

  it("stops every remaining reminder for that club after a LINE quota response", async () => {
    vi.stubEnv("APP_ENV", "staging");
    loadClubOaDispatchContext.mockResolvedValue({
      ok: true, context: { followers: ["Urecipient"], accessToken: "token" },
    });
    sendLineOaMessage.mockResolvedValue({
      status: "failed", failureCode: "rate_limited", batchCount: 1, sentBatchCount: 0,
      deliveredRecipientCount: 0,
    });
    const second = job({
      reminder_id: "66666666-6666-4666-8666-666666666666",
      recipient_membership_id: "77777777-7777-4777-8777-777777777777",
      recipient_app_account_id: "88888888-8888-4888-8888-888888888888",
      oa_user_id: "Usecond",
    });
    const calls: Array<{ name: string; args?: unknown }> = [];
    const supabase = supabaseStub([job(), second], calls);

    const result = await pushJoyIouDeadlineReminders(supabase);

    expect(result).toMatchObject({ failedCount: 1, quotaStoppedClubCount: 1 });
    expect(sendLineOaMessage).toHaveBeenCalledTimes(1);
    expect(calls.filter((call) => call.name === "record_joy_iou_deadline_reminder_delivery")).toHaveLength(1);
    expect(calls.find((call) => call.name === "halt_joy_iou_deadline_reminders_for_club")?.args)
      .toEqual({ p_club_id: clubId, p_as_of: expect.any(String) });
  });

  it("marks a timeout outcome unknown so a retry cannot send a duplicate", async () => {
    vi.stubEnv("APP_ENV", "staging");
    loadClubOaDispatchContext.mockResolvedValue({
      ok: true, context: { followers: ["Urecipient"], accessToken: "token" },
    });
    sendLineOaMessage.mockResolvedValue({
      status: "failed", failureCode: "provider_timeout", batchCount: 1, sentBatchCount: 0,
      deliveredRecipientCount: 0,
    });
    const calls: Array<{ name: string; args?: unknown }> = [];
    const supabase = supabaseStub([job()], calls);

    const result = await pushJoyIouDeadlineReminders(supabase);

    expect(result).toMatchObject({ unknownCount: 1, failedCount: 0 });
    expect(calls.find((call) => call.name === "record_joy_iou_deadline_reminder_delivery")?.args)
      .toMatchObject({ p_delivery_status: "unknown", p_failure_code: "provider_timeout" });
  });

  it("can continue delivering to another club after one club hits a quota limit", async () => {
    vi.stubEnv("APP_ENV", "staging");
    loadClubOaDispatchContext.mockImplementation(async (id: string) => ({
      ok: true, context: { followers: [id === clubId ? "Urecipient" : "Uother"], accessToken: "token" },
    }));
    sendLineOaMessage
      .mockResolvedValueOnce({
        status: "failed", failureCode: "rate_limited", batchCount: 1, sentBatchCount: 0,
        deliveredRecipientCount: 0,
      })
      .mockResolvedValueOnce({
        status: "sent", batchCount: 1, sentBatchCount: 1, deliveredRecipientCount: 1,
      });
    const second = job({
      reminder_id: "99999999-9999-4999-8999-999999999999",
      club_id: otherClubId,
      recipient_membership_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      recipient_app_account_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      oa_user_id: "Uother",
    });
    const supabase = supabaseStub([job(), second]);

    const result = await pushJoyIouDeadlineReminders(supabase);

    expect(result).toMatchObject({ failedCount: 1, sentCount: 1, quotaStoppedClubCount: 1 });
    expect(sendLineOaMessage).toHaveBeenCalledTimes(2);
  });
});
