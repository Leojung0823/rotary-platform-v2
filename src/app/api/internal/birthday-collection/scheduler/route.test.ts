import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  createTrustedAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createTrustedAdminClient: mocks.createTrustedAdminClient,
}));

import * as route from "./route";

const secret = "scheduler-secret-0123456789-abcdef-0123456789";

function request(authorization = `Bearer ${secret}`) {
  return new NextRequest("http://localhost:3000/api/internal/birthday-collection/scheduler", {
    method: "POST",
    headers: { authorization },
  });
}

describe("POST /api/internal/birthday-collection/scheduler", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("BIRTHDAY_COLLECTION_SCHEDULER_SECRET", secret);
    vi.stubEnv("DISABLE_BIRTHDAY_WISHES_COLLECTION_V1", "false");
    mocks.rpc.mockReset();
    mocks.createTrustedAdminClient.mockReset().mockReturnValue({ rpc: mocks.rpc });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("rejects a missing or incorrect secret before touching the admin client", async () => {
    const response = await route.POST(request("Bearer wrong-secret"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, reason: "unauthorized" });
    expect(mocks.createTrustedAdminClient).not.toHaveBeenCalled();
  });

  it("does not run in local or unknown environments", async () => {
    vi.stubEnv("APP_ENV", "local");
    const response = await route.POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "scheduler_unavailable" });
    expect(mocks.createTrustedAdminClient).not.toHaveBeenCalled();
  });

  it("honours the collection flag and does not run a disabled scheduler", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    const response = await route.POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "skipped", reason: "collection_disabled" });
    expect(mocks.rpc).toHaveBeenCalledWith("is_birthday_wish_collection_scheduler_enabled", {
      p_environment: "staging",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("runs the service-only scheduler after the flag is enabled", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: { generated_count: 1 }, error: null });
    const response = await route.POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: "completed",
      result: { generated_count: 1 },
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "run_birthday_wish_collection_scheduler", {
      p_as_of: expect.any(String),
    });
  });

  it("fails generically when the flag or scheduler RPC fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private-db-detail" } });
    const flagFailure = await route.POST(request());
    expect(flagFailure.status).toBe(503);
    expect(await flagFailure.json()).toEqual({ ok: false, reason: "scheduler_unavailable" });

    mocks.rpc.mockReset()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "sql-secret-detail" } });
    const schedulerFailure = await route.POST(request());
    expect(schedulerFailure.status).toBe(503);
    expect(await schedulerFailure.json()).toEqual({ ok: false, reason: "scheduler_failed" });
  });

  it("honours the emergency kill switch", async () => {
    vi.stubEnv("DISABLE_BIRTHDAY_WISHES_COLLECTION_V1", "true");
    const response = await route.POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "skipped", reason: "kill_switch" });
    expect(mocks.createTrustedAdminClient).not.toHaveBeenCalled();
  });

  it("fails closed on an invalid emergency kill-switch configuration", async () => {
    vi.stubEnv("DISABLE_BIRTHDAY_WISHES_COLLECTION_V1", "yes");
    const response = await route.POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, reason: "scheduler_unavailable" });
    expect(mocks.createTrustedAdminClient).not.toHaveBeenCalled();
  });

  it("exports no GET handler", () => {
    expect("GET" in route).toBe(false);
  });
});
