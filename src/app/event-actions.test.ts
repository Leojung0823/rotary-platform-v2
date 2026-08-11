import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { createEventAction } from "./event-actions";
import { initialEventCreateActionState } from "@/lib/events/validation";

const clubId = "a1000000-0000-4000-8000-000000000001";

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
    form.set(key, String(value));
  }
  return form;
}

async function submit(overrides: Record<string, string | boolean> = {}) {
  return createEventAction(initialEventCreateActionState, formData(overrides));
}

describe("createEventAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ error: null });
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
});
