import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
  rpc: vi.fn(),
  requireIdentity: vi.fn(),
  evaluateCurrentFeatureFlag: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ requireIdentity: mocks.requireIdentity }));
vi.mock("@/lib/product/feature-flag-adapter.server", () => ({ evaluateCurrentFeatureFlag: mocks.evaluateCurrentFeatureFlag }));

import { cancelEventAction, createEventAction, registerEventAction } from "./event-actions";
import { initialEventCreateActionState } from "@/lib/events/validation";

const clubId = "a1000000-0000-4000-8000-000000000001";

describe("one-click registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ error: null });
  });
  const registration = (overrides: Record<string, string> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ clubId, eventId: "a2000000-0000-4000-8000-000000000001", response: "attending", guestCount: "2", note: "攜伴", ...overrides })) data.set(key, value);
    return registerEventAction({ status: "idle" }, data);
  };
  it("acknowledges the protected write without redirecting or waiting on a page refresh", async () => {
    expect(await registration()).toEqual({ status: "success", response: "attending", guestCount: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith("set_my_event_registration", expect.objectContaining({ p_club_id: clubId, p_guest_count: 2, p_response: "attending", p_note: "攜伴" }));
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
  it.each(["declined", "pending"])("clears saved guests when choosing %s", async (response) => {
    expect(await registration({ response })).toEqual({ status: "success", response, guestCount: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith("set_my_event_registration", expect.objectContaining({ p_guest_count: 0, p_response: response }));
  });
  it("rejects malformed inputs without calling the database", async () => {
    expect(await registration({ guestCount: "21" })).toEqual({ status: "error", errorCode: "invalid_input" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([["event_capacity_full", "capacity_full"], ["event_registration_closed", "registration_closed"], ["active_event_membership_required", "forbidden"]])("never reports success for %s", async (message, errorCode) => {
    mocks.rpc.mockResolvedValue({ error: { message } });
    expect(await registration()).toEqual({ status: "error", errorCode });
  });
  it("keeps network errors private and does not pretend the result is saved", async () => {
    mocks.rpc.mockRejectedValue(new Error("private network information"));
    expect(await registration()).toEqual({ status: "error", errorCode: "unexpected" });
  });
});

function formData(overrides: Record<string, string | boolean> = {}) {
  const values: Record<string, string | boolean> = {
    eventType: "service",
    title: "淨灘服務活動",
    startsAt: "2026-08-20T18:30",
    endsAt: "2026-08-20T20:30",
    registrationDeadline: "2026-08-19T18:30",
    capacity: "80",
    location: "河濱公園",
    countsForAttendance: true,
    description: "請攜帶手套與飲水。",
    ...overrides,
  };
  const form = new FormData();
  form.set("clubId", clubId);
  for (const [key, value] of Object.entries(values)) {
    if (key === "countsForAttendance") {
      if (value) form.set(key, "on");
      continue;
    }
    if (key === "timeUnspecified") {
      if (value) form.set(key, "on");
      continue;
    }
    form.set(key, String(value));
  }
  return form;
}

async function submit(overrides: Record<string, string | boolean> = {}) {
  return createEventAction(initialEventCreateActionState, formData(overrides));
}

function cancelFormData(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("clubId", clubId);
  form.set("eventId", "a2000000-0000-4000-8000-000000000001");
  form.set("mode", "management");
  form.set("reason", "staging 活動驗收完成");
  for (const [key, value] of Object.entries(overrides)) form.set(key, value);
  return form;
}

describe("createEventAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.requireIdentity.mockResolvedValue({ id: "a3000000-0000-4000-8000-000000000001" });
    mocks.evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: false });
  });

  it("keeps all submitted values when title validation fails", async () => {
    const state = await submit({ title: "" });
    expect(state).toMatchObject({
      status: "error",
      values: {
        eventType: "service",
        title: "",
        startsAt: "2026-08-20T18:30",
        endsAt: "2026-08-20T20:30",
        registrationDeadline: "2026-08-19T18:30",
        capacity: "80",
        location: "河濱公園",
        countsForAttendance: true,
        description: "請攜帶手套與飲水。",
      },
      fieldErrors: { title: "請輸入活動名稱。" },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("keeps invalid capacity and an unchecked attendance checkbox", async () => {
    const state = await submit({ capacity: "1.5", countsForAttendance: false });
    expect(state).toMatchObject({
      status: "error",
      values: { capacity: "1.5", countsForAttendance: false, title: "淨灘服務活動" },
      fieldErrors: { capacity: "名額必須是 1 至 10000 的整數，或留空表示不限。" },
    });
  });

  it("keeps malformed datetime input and returns a bounded field error", async () => {
    const state = await submit({ startsAt: "2026/08/20 18:30" });
    expect(state).toMatchObject({
      values: { startsAt: "2026/08/20 18:30", endsAt: "2026-08-20T20:30" },
      fieldErrors: { startsAt: "請輸入有效的開始日期與時間。" },
    });
  });

  it("keeps values and identifies an end time that is not after the start", async () => {
    const state = await submit({ endsAt: "2026-08-20T18:30" });
    expect(state).toMatchObject({
      values: { startsAt: "2026-08-20T18:30", endsAt: "2026-08-20T18:30" },
      fieldErrors: { endsAt: "結束時間必須晚於開始時間。" },
    });
  });

  it("keeps values and identifies a registration deadline after the start", async () => {
    const state = await submit({ registrationDeadline: "2026-08-20T18:31" });
    expect(state).toMatchObject({
      values: { registrationDeadline: "2026-08-20T18:31" },
      fieldErrors: { registrationDeadline: "報名截止時間不得晚於活動開始時間。" },
    });
  });

  it("keeps values for a business-rule RPC failure without exposing the database message", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "event_manage_required: internal predicate" } });
    const state = await submit();
    expect(state).toMatchObject({
      status: "error",
      values: { title: "淨灘服務活動", location: "河濱公園" },
      formError: "目前帳號沒有建立此扶輪社活動的權限。請確認社別與權限後再試。",
    });
    expect(JSON.stringify(state)).not.toContain("internal predicate");
  });

  it("keeps values for an unexpected RPC error and offers a safe retry", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Postgres 42P01 secret database detail" } });
    const state = await submit({ capacity: "", countsForAttendance: false });
    expect(state).toMatchObject({
      status: "error",
      values: { capacity: "", countsForAttendance: false, description: "請攜帶手套與飲水。" },
      formError: "目前無法建立活動草稿，請稍後再試。已輸入的內容仍保留，可直接重試。",
    });
    expect(JSON.stringify(state)).not.toContain("42P01");
  });

  it("keeps values when the RPC request temporarily throws", async () => {
    mocks.rpc.mockRejectedValue(new Error("network timeout with internal details"));
    const state = await submit({ location: "暫存的活動地點" });
    expect(state).toMatchObject({
      status: "error",
      values: { location: "暫存的活動地點", title: "淨灘服務活動" },
      formError: "目前無法建立活動草稿，請稍後再試。已輸入的內容仍保留，可直接重試。",
    });
    expect(JSON.stringify(state)).not.toContain("internal details");
  });

  it("retains the existing successful revalidation and redirect behavior", async () => {
    await expect(submit()).rejects.toThrow(`redirect:/events?clubId=${clubId}&success=event_created`);
    expect(mocks.rpc).toHaveBeenCalledWith("create_club_event", expect.objectContaining({
      p_club_id: clubId,
      p_capacity: 80,
      p_counts_for_attendance: true,
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events");
    expect(mocks.redirect).toHaveBeenCalledWith(`/events?clubId=${clubId}&success=event_created`);
  });

  it("uses the protected time-mode RPC only for a feature-enabled date-only event", async () => {
    mocks.evaluateCurrentFeatureFlag.mockResolvedValue({ enabled: true });
    const form = formData({
      eventDate: "2026-12-08",
      timeUnspecified: true,
      startsAt: "",
      endsAt: "",
      registrationDeadline: "",
    });

    await expect(createEventAction(initialEventCreateActionState, form))
      .rejects.toThrow(`redirect:/events?clubId=${clubId}&success=event_created`);
    expect(mocks.evaluateCurrentFeatureFlag).toHaveBeenCalledWith({
      key: "event_date_only_v1",
      subjectUuid: "a3000000-0000-4000-8000-000000000001",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("create_club_event_with_time_mode", expect.objectContaining({
      p_time_unspecified: true,
      p_registration_deadline: null,
    }));
  });

  it("does not consult the new feature flag for an ordinary timed event", async () => {
    await expect(submit()).rejects.toThrow(`redirect:/events?clubId=${clubId}&success=event_created`);
    expect(mocks.evaluateCurrentFeatureFlag).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("create_club_event", expect.any(Object));
  });
});

describe("cancelEventAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("maps a bounded database wait to a safe retry message", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "event_cancel_statement_timeout" } });

    await expect(cancelEventAction(cancelFormData())).rejects.toThrow(
      `redirect:/clubs/${clubId}/events?error=retryable&mode=management`,
    );
  });

  it("maps a client or network exception to the same safe retry message", async () => {
    mocks.rpc.mockRejectedValue(new Error("network timeout with internal details"));

    await expect(cancelEventAction(cancelFormData())).rejects.toThrow(
      `redirect:/clubs/${clubId}/events?error=retryable&mode=management`,
    );
  });

  it("keeps the existing successful cancellation redirect", async () => {
    await expect(cancelEventAction(cancelFormData())).rejects.toThrow(
      `redirect:/clubs/${clubId}/events?success=event_cancelled&mode=management`,
    );
    expect(mocks.rpc).toHaveBeenCalledWith("cancel_club_event", {
      p_club_id: clubId,
      p_event_id: "a2000000-0000-4000-8000-000000000001",
      p_reason: "staging 活動驗收完成",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/events");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/clubs/${clubId}/events`);
  });
});
