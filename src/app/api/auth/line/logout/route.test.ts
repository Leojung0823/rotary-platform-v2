import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  createClient: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.cookieSet }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import * as route from "./route";

function request(origin = "http://localhost:3000", fetchSite = "same-origin") {
  return new NextRequest("http://localhost:3000/api/auth/line/logout", {
    method: "POST",
    headers: { origin, "sec-fetch-site": fetchSite },
  });
}

describe("POST /api/auth/line/logout", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    mocks.cookieSet.mockReset();
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    mocks.createClient.mockReset().mockResolvedValue({ auth: { signOut: mocks.signOut } });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("signs out the current Supabase session", async () => {
    const response = await route.POST(request());
    expect(await response.json()).toEqual({ success: true });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("clears LINE OAuth and MVP device cookies", async () => {
    await route.POST(request());
    expect(mocks.cookieSet.mock.calls.map((call) => call[0])).toEqual([
      "line_oauth_state",
      "line_oauth_nonce",
      "line_invitation",
      "line_return_to",
      "rotary_device",
    ]);
  });

  it("is idempotent when repeated", async () => {
    expect(await (await route.POST(request())).json()).toEqual({ success: true });
    expect(await (await route.POST(request())).json()).toEqual({ success: true });
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
  });

  it("returns generic success for an unauthenticated browser", async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    expect(await (await route.POST(request())).json()).toEqual({ success: true });
  });

  it("rejects a cross-site logout before touching Supabase", async () => {
    const response = await route.POST(request("https://evil.example", "cross-site"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("returns a generic failure without raw Supabase details", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "refresh-token-secret-detail" } });
    const response = await route.POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false });
  });

  it("exports no GET logout handler", () => {
    expect("GET" in route).toBe(false);
  });

  it("has no identity or membership mutation boundary", async () => {
    await route.POST(request());
    const client = await mocks.createClient.mock.results[0].value;
    expect(Object.keys(client)).toEqual(["auth"]);
  });
});
