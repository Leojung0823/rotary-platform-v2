import { afterEach, describe, expect, it, vi } from "vitest";
import { composeEventPushText } from "./event-push";

const evaluateCurrentFeatureFlag = vi.hoisted(() => vi.fn());
const loadClubOaDispatchContext = vi.hoisted(() => vi.fn());
const deliverClubOaText = vi.hoisted(() => vi.fn());

vi.mock("@/lib/product/feature-flag-adapter.server", () => ({ evaluateCurrentFeatureFlag }));
vi.mock("./oa-dispatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./oa-dispatch")>()),
  loadClubOaDispatchContext,
  deliverClubOaText,
}));

const { pushPublishedEventToLine } = await import("./event-push");

type RpcCall = { name: string; args: Record<string, unknown> };

function supabaseStub(projection: unknown, calls: RpcCall[], failTargets = false) {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "list_club_event_line_targets") {
        return failTargets ? { data: null, error: { message: "denied" } } : { data: projection, error: null };
      }
      return { data: "push-log-id", error: null };
    }),
  } as never;
}

const ids = {
  clubId: "11111111-1111-4111-8111-111111111111",
  eventId: "33333333-3333-4333-8333-333333333333",
};

const published = {
  title: "九月例會",
  location: "台北國賓飯店",
  starts_at: "2026-09-10T11:30:00.000Z",
  event_status: "published",
  oa_user_ids: ["Uone", "Utwo"],
};

describe("event publish LINE push", () => {
  afterEach(() => vi.clearAllMocks());

  it("does nothing while the flag is off", async () => {
    evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: false });
    const calls: RpcCall[] = [];

    const outcome = await pushPublishedEventToLine({ supabase: supabaseStub(published, calls), ...ids });

    expect(outcome).toEqual({ status: "skipped", reason: "flag_disabled" });
    expect(calls).toHaveLength(0);
  });

  it("refuses to announce an event the projection does not call published", async () => {
    evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: true });
    loadClubOaDispatchContext.mockResolvedValue({ ok: true, context: { followers: [], accessToken: "t" } });
    const calls: RpcCall[] = [];

    const outcome = await pushPublishedEventToLine({
      supabase: supabaseStub({ ...published, event_status: "draft" }, calls), ...ids,
    });

    expect(outcome).toEqual({ status: "failed", reason: "event_not_published" });
    expect(deliverClubOaText).not.toHaveBeenCalled();
  });

  it("pushes to the addressed audience and records the log against the event", async () => {
    evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: true });
    loadClubOaDispatchContext.mockResolvedValue({
      ok: true, context: { followers: ["Uone", "Utwo", "Uthree"], accessToken: "t" },
    });
    deliverClubOaText.mockResolvedValue({
      status: "sent", batchCount: 1, sentBatchCount: 1, deliveredRecipientCount: 2, requestId: "req-9",
    });
    const calls: RpcCall[] = [];

    const outcome = await pushPublishedEventToLine({ supabase: supabaseStub(published, calls), ...ids });

    expect(deliverClubOaText).toHaveBeenCalledWith(
      "multicast", ["Uone", "Utwo"], expect.stringContaining("九月例會"), expect.anything(),
    );
    expect(outcome).toEqual({ status: "sent", recipientCount: 2 });
    const logged = calls.find((call) => call.name === "record_club_event_line_push");
    expect(logged?.args.p_event_id).toBe(ids.eventId);
  });

  it("skips without a log when nobody addressed can be reached", async () => {
    evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: true });
    loadClubOaDispatchContext.mockResolvedValue({ ok: true, context: { followers: ["Uone"], accessToken: "t" } });
    const calls: RpcCall[] = [];

    const outcome = await pushPublishedEventToLine({
      supabase: supabaseStub({ ...published, oa_user_ids: [] }, calls), ...ids,
    });

    expect(outcome).toEqual({ status: "skipped", reason: "no_reachable_recipients" });
    expect(calls.map((call) => call.name)).toEqual(["list_club_event_line_targets"]);
  });

  it("reports a refused target query rather than guessing an audience", async () => {
    evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: true });
    loadClubOaDispatchContext.mockResolvedValue({ ok: true, context: { followers: ["Uone"], accessToken: "t" } });
    const calls: RpcCall[] = [];

    const outcome = await pushPublishedEventToLine({ supabase: supabaseStub(null, calls, true), ...ids });

    expect(outcome).toEqual({ status: "failed", reason: "targets_unavailable" });
    expect(deliverClubOaText).not.toHaveBeenCalled();
  });
});

describe("event push text", () => {
  it("carries what a member needs to decide whether to go", () => {
    const text = composeEventPushText({
      title: "九月例會", location: "台北國賓飯店", startsAt: "2026-09-10T11:30:00.000Z",
    });
    expect(text).toContain("九月例會");
    expect(text).toContain("台北國賓飯店");
    // Taipei time, not UTC: 11:30Z is 19:30 locally, stated in 24-hour form.
    expect(text).toContain("19:30");
    expect(text).not.toContain("晚上");
  });

  it("omits an empty location instead of printing a blank line", () => {
    const text = composeEventPushText({ title: "爐邊會談", location: "", startsAt: "2026-09-10T11:30:00.000Z" });
    expect(text).not.toContain("地點：");
  });

  it("survives an unparseable start time without printing Invalid Date", () => {
    const text = composeEventPushText({ title: "活動", location: null, startsAt: "not-a-date" });
    expect(text).not.toContain("Invalid");
    expect(text).toContain("活動");
  });
});
