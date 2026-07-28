import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import * as route from "./route";

describe("GET /api/auth/line/session", () => {
  beforeEach(() => {
    mocks.getUser.mockReset();
    mocks.createClient.mockReset().mockResolvedValue({ auth: { getUser: mocks.getUser } });
  });

  it("returns authenticated true for a verified Supabase user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-user-id", email: "private@example.test" } }, error: null });
    const response = await route.GET();
    expect(await response.json()).toEqual({ authenticated: true });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns authenticated false for missing or invalid sessions", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "refresh-token-secret-detail" } });
    const body = await (await route.GET()).json();
    expect(body).toEqual({ authenticated: false });
    expect(JSON.stringify(body)).not.toContain("refresh-token-secret-detail");
  });

  it("returns only the authentication boolean", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-id", user_metadata: { line: "U-secret" } } }, error: null });
    const body = await (await route.GET()).json();
    expect(Object.keys(body)).toEqual(["authenticated"]);
  });

  it("fails closed when the Supabase boundary throws", async () => {
    mocks.createClient.mockRejectedValue(new Error("service-role-key-detail"));
    expect(await (await route.GET()).json()).toEqual({ authenticated: false });
  });
});
