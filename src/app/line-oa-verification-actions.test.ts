import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), admin: vi.fn(), permissions: vi.fn(), record: vi.fn(),
  single: vi.fn(), eq: vi.fn(), select: vi.fn(), from: vi.fn(), secret: vi.fn(),
  fetch: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createTrustedAdminClient: mocks.admin }));
vi.mock("@/lib/line/oa-runtime", () => ({ readServerSecret: mocks.secret }));
import { verifyLineOaAction } from "./line-oa-verification-actions";

const clubId = "a1000000-0000-4000-8000-000000000001";
const accountId = "a2000000-0000-4000-8000-000000000001";
const botInfo = { basicId: "@test-oa", userId: `U${"1".repeat(32)}` };
function submit(id = clubId) {
  const form = new FormData();
  form.set("clubId", id);
  // Forged browser fields must not influence the account or credential used.
  form.set("accessToken", "browser-forgery");
  form.set("basicId", "@forged");
  return verifyLineOaAction(form);
}
describe("LINE OA identity verification action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("LINE_OA_MODE", "line");
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
    mocks.createClient.mockResolvedValue({ rpc: mocks.permissions });
    mocks.permissions.mockResolvedValue({ data: [{ permission_key: "oa.manage" }], error: null });
    mocks.admin.mockReturnValue({ from: mocks.from, rpc: mocks.record });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ eq: mocks.eq, maybeSingle: mocks.single });
    mocks.single.mockResolvedValue({ data: {
      id: accountId, basic_id: botInfo.basicId, account_status: "active",
      access_token_env_key: "TEST_OA_ACCESS_TOKEN",
    }, error: null });
    mocks.secret.mockReturnValue("server-test-token");
    mocks.fetch.mockResolvedValue(Response.json(botInfo));
    mocks.record.mockResolvedValue({ data: true, error: null });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("uses the authorized club's server credential and records only verified LINE data", async () => {
    await expect(submit()).rejects.toThrow(`redirect:/clubs/${clubId}/line-oa?success=verified`);
    expect(mocks.permissions).toHaveBeenCalledWith("list_my_permissions", { p_club_id: clubId });
    expect(mocks.eq).toHaveBeenCalledWith("club_id", clubId);
    expect(mocks.eq).toHaveBeenCalledWith("account_status", "active");
    expect(mocks.secret).toHaveBeenCalledWith("TEST_OA_ACCESS_TOKEN", "LINE OA access token");
    expect(mocks.fetch).toHaveBeenCalledWith("https://api.line.me/v2/bot/info", expect.objectContaining({
      method: "GET", cache: "no-store", redirect: "error",
      headers: { Accept: "application/json", Authorization: "Bearer server-test-token" },
      signal: expect.any(AbortSignal),
    }));
    expect(mocks.record).toHaveBeenCalledWith("record_line_oa_account_identity_verification", {
      p_line_oa_account_id: accountId, p_basic_id: botInfo.basicId, p_bot_user_id: botInfo.userId,
    });
    expect(JSON.stringify(mocks.redirect.mock.calls)).not.toContain("server-test-token");
  });
  it.each([{ data: [] }, { data: [{ permission_key: "oa.read" }] }])("blocks callers without this club's manage permission", async ({ data }) => {
    mocks.permissions.mockResolvedValue({ data, error: null });
    await expect(submit()).rejects.toThrow("error=forbidden");
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("rejects malformed club IDs before using privileged resources", async () => {
    await expect(submit("../../other")).rejects.toThrow("redirect:/dashboard?error=unexpected");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("fails closed in mock mode", async () => {
    vi.stubEnv("LINE_OA_MODE", "mock");
    await expect(submit()).rejects.toThrow("error=oa_live_mode_required");
    expect(mocks.secret).not.toHaveBeenCalled();
  });
  it("does not fetch when the server credential is missing", async () => {
    mocks.secret.mockImplementation(() => { throw new Error("private config detail"); });
    await expect(submit()).rejects.toThrow("error=oa_not_configured");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("does not record a different club's OA", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ...botInfo, basicId: "@other-club" }));
    await expect(submit()).rejects.toThrow("error=oa_identity_mismatch");
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it.each([401, 403, 429, 500, 400])("does not record a rejected LINE response (%s)", async (status) => {
    mocks.fetch.mockResolvedValue(new Response("private-provider-detail", { status }));
    await expect(submit()).rejects.toThrow("?error=");
    expect(mocks.record).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.redirect.mock.calls)).not.toContain("private-provider-detail");
  });
  it.each([{}, { basicId: "@test-oa" }, { ...botInfo, userId: "invalid" }])("rejects incomplete bot information", async (body) => {
    mocks.fetch.mockResolvedValue(Response.json(body));
    await expect(submit()).rejects.toThrow("error=oa_verification_failed");
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("returns a safe failure when LINE times out", async () => {
    mocks.fetch.mockRejectedValue(new DOMException("private timeout", "TimeoutError"));
    await expect(submit()).rejects.toThrow("error=provider_timeout");
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("does not claim success when persistence rejects changed configuration", async () => {
    mocks.record.mockResolvedValue({ data: null, error: { message: "line_oa_identity_not_found" } });
    await expect(submit()).rejects.toThrow("error=oa_verification_failed");
  });
});
