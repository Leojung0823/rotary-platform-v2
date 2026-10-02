import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createTrustedAdminClient: vi.fn(),
  pushJoyIouDeadlineReminders: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createTrustedAdminClient: mocks.createTrustedAdminClient,
}));
vi.mock("@/lib/line/joy-iou-deadline-reminders", () => ({
  pushJoyIouDeadlineReminders: mocks.pushJoyIouDeadlineReminders,
}));

import * as route from "./route";

const secret = "scheduler-secret-0123456789-abcdef-0123456789";

function request(authorization = "Bearer " + secret) {
  return new NextRequest("http://localhost:3000/api/internal/message-center/scheduler", {
    method: "POST",
    headers: { authorization },
  });
}

describe("POST /api/internal/message-center/scheduler", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("MESSAGE_CENTER_SCHEDULER_SECRET", secret);
    mocks.rpc.mockReset();
    mocks.pushJoyIouDeadlineReminders.mockReset().mockResolvedValue({
      status: "completed",
      jobCount: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      unknownCount: 0,
      quotaStoppedClubCount: 0,
    });
    mocks.createTrustedAdminClient.mockReset().mockReturnValue({ rpc: mocks.rpc });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects an invalid secret before creating the admin client", async () => {
    const response = await route.POST(request("Bearer incorrect"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, reason: "unauthorized" });
    expect(mocks.createTrustedAdminClient).not.toHaveBeenCalled();
  });

  it("stays unavailable outside staging", async () => {
    vi.stubEnv("APP_ENV", "production");
    const response = await route.POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "scheduler_unavailable" });
    expect(mocks.createTrustedAdminClient).not.toHaveBeenCalled();
  });

  it("runs Joy reminders even when the announcement scheduler is disabled", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    const response = await route.POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      status: "completed",
      announcements: { status: "skipped", reason: "announcements_disabled" },
      joy_iou_reminders: { status: "completed", jobCount: 0 },
    });
    expect(mocks.pushJoyIouDeadlineReminders).toHaveBeenCalledWith(
      expect.objectContaining({ rpc: mocks.rpc }),
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("runs both scheduled domains when announcements are enabled", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { published_count: 2 }, error: null });
    const response = await route.POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      announcements: { status: "completed", result: { published_count: 2 } },
      joy_iou_reminders: { status: "completed" },
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "run_club_message_scheduler", {
      p_as_of: expect.any(String),
      p_limit: 50,
    });
    expect(mocks.pushJoyIouDeadlineReminders).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a database scheduler check fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private-detail" } });
    const response = await route.POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "scheduler_unavailable" });
    expect(mocks.pushJoyIouDeadlineReminders).not.toHaveBeenCalled();
  });

  it("returns a generic failure when Joy reminder delivery could not be recorded", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    mocks.pushJoyIouDeadlineReminders.mockResolvedValueOnce({
      status: "failed",
      jobCount: 1,
      sentCount: 0,
      failedCount: 1,
      skippedCount: 0,
      unknownCount: 0,
      quotaStoppedClubCount: 0,
    });
    const response = await route.POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "scheduler_failed" });
  });

  it("does not export GET", () => {
    expect("GET" in route).toBe(false);
  });
});
