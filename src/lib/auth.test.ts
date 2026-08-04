import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { resolveIdentity } from "./auth";

const activeIdentity = {
  id: "account-id",
  person_id: "person-id",
  display_name: "測試社員",
  email: "member@example.test",
  status: "active",
  platform_roles: [],
};

describe("authenticated identity resolution", () => {
  beforeEach(() => {
    mocks.getClaims.mockReset().mockResolvedValue({
      data: { claims: { sub: "auth-user-id" } },
      error: null,
    });
    mocks.getUser.mockReset();
    mocks.rpc.mockReset().mockImplementation((name: string) => {
      if (name === "resolve_current_app_account") return Promise.resolve({ data: activeIdentity, error: null });
      if (name === "current_account_has_active_access") return Promise.resolve({ data: true, error: null });
      throw new Error(`Unexpected RPC: ${name}`);
    });
    mocks.createClient.mockReset().mockResolvedValue({
      auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
      rpc: mocks.rpc,
    });
    mocks.redirect.mockReset().mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it("resolves an active account from verified claims without getUser", async () => {
    await expect(resolveIdentity()).resolves.toEqual(activeIdentity);

    expect(mocks.getClaims).toHaveBeenCalledOnce();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("resolve_current_app_account");
    expect(mocks.rpc).toHaveBeenCalledWith("current_account_has_active_access");
  });

  it("redirects before account RPCs when claims are absent", async () => {
    mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });

    await expect(resolveIdentity()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps the existing active-access boundary", async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "resolve_current_app_account") return Promise.resolve({ data: activeIdentity, error: null });
      return Promise.resolve({ data: false, error: null });
    });

    await expect(resolveIdentity()).rejects.toThrow("NEXT_REDIRECT:/access-denied?reason=no_active_access");
  });
});
