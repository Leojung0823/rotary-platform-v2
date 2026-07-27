import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  cookieSet: vi.fn(),
  exchangeLineCode: vi.fn(),
  generateLink: vi.fn(),
  verifyOtp: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
}));

let cookieValues: Record<string, string>;
let stateSelectResult: { data: Record<string, unknown> | null; error: unknown };
let stateConsumeResult: { data: Record<string, unknown> | null; error: unknown };
let stateCalls: number;
let identityCalls: number;
let stateConsumeChain: ReturnType<typeof query> | null;

function query(result: unknown) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    gt: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.gt.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.insert.mockReturnValue(chain);
  return chain;
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => cookieValues[name] ? { name, value: cookieValues[name] } : undefined,
    set: mocks.cookieSet,
  }),
  headers: async () => new Headers({ "user-agent": "callback-test-agent" }),
}));

vi.mock("../../../../../lib/line/provider", () => ({
  exchangeLineCode: mocks.exchangeLineCode,
  lineMode: () => "mock",
}));

vi.mock("@/lib/supabase/admin", () => ({
  createTrustedAdminClient: () => ({
    from: mocks.adminFrom,
    auth: { admin: { generateLink: mocks.generateLink, createUser: vi.fn() } },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { verifyOtp: mocks.verifyOtp, signOut: mocks.signOut },
    rpc: mocks.rpc,
  }),
}));

import { GET } from "./route";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function callbackUrl(parameters: string) {
  return new NextRequest(`http://localhost:3000/api/auth/line/callback?${parameters}`);
}

function clearedCookieNames() {
  return mocks.cookieSet.mock.calls
    .filter((call) => call[1] === "" && call[2]?.maxAge === 0)
    .map((call) => call[0]);
}

describe("GET /api/auth/line/callback", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    cookieValues = {
      line_oauth_state: "expected-state",
      line_oauth_nonce: "expected-nonce",
      line_invitation: "",
      line_return_to: "/dashboard",
    };
    stateSelectResult = {
      data: {
        id: "oauth-state-id",
        nonce_hash: digest("expected-nonce"),
        invitation_token_hash: null,
        return_path: "/dashboard",
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        consumed_at: null,
      },
      error: null,
    };
    stateConsumeResult = { data: { id: "oauth-state-id" }, error: null };
    stateCalls = 0;
    identityCalls = 0;
    stateConsumeChain = null;

    mocks.cookieSet.mockReset();
    mocks.exchangeLineCode.mockReset().mockResolvedValue({
      subject: "Utest12345678",
      displayName: "測試社員",
      email: "member@example.test",
    });
    mocks.generateLink.mockReset().mockResolvedValue({
      data: { properties: { hashed_token: "hashed-magic-link-token" } },
      error: null,
    });
    mocks.verifyOtp.mockReset().mockResolvedValue({ error: null });
    mocks.rpc.mockReset().mockResolvedValue({ data: "device-id", error: null });
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    mocks.adminFrom.mockReset().mockImplementation((table: string) => {
      if (table === "line_oauth_states") {
        stateCalls += 1;
        if (stateCalls === 1) return query(stateSelectResult);
        stateConsumeChain = query(stateConsumeResult);
        return stateConsumeChain;
      }
      if (table === "line_identities") {
        identityCalls += 1;
        return identityCalls === 1
          ? query({ data: { app_account_id: "account-id" }, error: null })
          : query({ data: null, error: null });
      }
      if (table === "app_accounts") {
        return query({
          data: {
            id: "account-id",
            person_id: "person-id",
            auth_user_id: "auth-user-id",
            login_email: "member@example.test",
          },
          error: null,
        });
      }
      if (table === "member_invitations") {
        return query({ data: { person_id: "person-id" }, error: null });
      }
      return query({ data: null, error: null });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("completes a valid state, nonce, code, identity, and session flow", async () => {
    const response = await GET(callbackUrl("state=expected-state&code=signed-code"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(mocks.exchangeLineCode).toHaveBeenCalledWith("signed-code", "expected-nonce");
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "hashed-magic-link-token" });
    expect(mocks.rpc).toHaveBeenCalledWith("record_login_and_device", expect.objectContaining({ p_provider_key: "line_mock" }));
  });

  it("uses an atomic unexpired compare-and-set before provider exchange", async () => {
    await GET(callbackUrl("state=expected-state&code=signed-code"));
    expect(stateConsumeChain?.is).toHaveBeenCalledWith("consumed_at", null);
    expect(stateConsumeChain?.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
    expect(stateConsumeChain?.select).toHaveBeenCalledWith("id");
  });

  it("clears all one-time cookies after success", async () => {
    await GET(callbackUrl("state=expected-state&code=signed-code"));
    expect(clearedCookieNames()).toEqual([
      "line_oauth_state",
      "line_oauth_nonce",
      "line_invitation",
      "line_return_to",
    ]);
  });

  it("fails generically and clears cookies when state is missing", async () => {
    const response = await GET(callbackUrl("code=signed-code"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=line_login_failed");
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(clearedCookieNames()).toHaveLength(4);
  });

  it("fails before lookup or exchange on state mismatch", async () => {
    await GET(callbackUrl("state=wrong-state&code=signed-code"));
    expect(mocks.adminFrom).not.toHaveBeenCalled();
    expect(mocks.exchangeLineCode).not.toHaveBeenCalled();
  });

  it("terminally consumes a valid state when code is missing", async () => {
    const response = await GET(callbackUrl("state=expected-state"));
    expect(response.headers.get("location")).toContain("line_login_failed");
    expect(stateCalls).toBe(2);
    expect(mocks.exchangeLineCode).not.toHaveBeenCalled();
  });

  it("terminally consumes a valid state on provider cancel", async () => {
    const response = await GET(callbackUrl("state=expected-state&error=access_denied&error_description=private-provider-detail"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=line_login_failed");
    expect(stateCalls).toBe(2);
    expect(mocks.exchangeLineCode).not.toHaveBeenCalled();
    expect(response.headers.get("location")).not.toContain("private-provider-detail");
  });

  it("redacts callback state, nonce, invitation, and provider details from the public failure", async () => {
    const sensitiveValues = {
      state: "raw-state-secret-value",
      nonce: "raw-nonce-secret-value",
      invitation: "raw-invitation-secret-value",
      providerDetail: "raw-provider-error-description",
    };
    cookieValues.line_oauth_state = sensitiveValues.state;
    cookieValues.line_oauth_nonce = sensitiveValues.nonce;
    cookieValues.line_invitation = sensitiveValues.invitation;
    cookieValues.line_return_to = "/join";
    stateSelectResult.data!.nonce_hash = digest(sensitiveValues.nonce);
    stateSelectResult.data!.invitation_token_hash = digest(sensitiveValues.invitation);
    stateSelectResult.data!.return_path = "/join";
    const response = await GET(callbackUrl(
      `state=${encodeURIComponent(sensitiveValues.state)}&error=access_denied&error_description=${encodeURIComponent(sensitiveValues.providerDetail)}`,
    ));
    const publicResult = `${response.headers.get("location")} ${await response.text()}`;
    for (const sensitive of Object.values(sensitiveValues)) {
      expect(publicResult).not.toContain(sensitive);
    }
  });

  it("rejects an already consumed state", async () => {
    stateSelectResult.data!.consumed_at = new Date().toISOString();
    await GET(callbackUrl("state=expected-state&code=signed-code"));
    expect(stateCalls).toBe(1);
    expect(mocks.exchangeLineCode).not.toHaveBeenCalled();
  });

  it("rejects an expired state", async () => {
    stateSelectResult.data!.expires_at = new Date(Date.now() - 1_000).toISOString();
    await GET(callbackUrl("state=expected-state&code=signed-code"));
    expect(stateCalls).toBe(1);
    expect(mocks.exchangeLineCode).not.toHaveBeenCalled();
  });

  it("rejects a nonce digest mismatch", async () => {
    stateSelectResult.data!.nonce_hash = digest("other-nonce");
    await GET(callbackUrl("state=expected-state&code=signed-code"));
    expect(mocks.exchangeLineCode).not.toHaveBeenCalled();
  });

  it("fails closed when the compare-and-set reports replay", async () => {
    stateConsumeResult = { data: null, error: null };
    await GET(callbackUrl("state=expected-state&code=signed-code"));
    expect(mocks.exchangeLineCode).not.toHaveBeenCalled();
  });

  it("genericizes provider exchange failure and clears cookies", async () => {
    const sensitiveValues = [
      "authorization-code-secret",
      "provider-access-token-secret",
      "provider-refresh-token-secret",
      "provider-id-token-secret",
      "channel-secret-value",
      "service-role-key-value",
    ];
    mocks.exchangeLineCode.mockRejectedValue(new Error(sensitiveValues.slice(1).join(" ")));
    const response = await GET(callbackUrl(`state=expected-state&code=${sensitiveValues[0]}`));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?error=line_login_failed");
    for (const sensitive of sensitiveValues) {
      expect(response.headers.get("location")).not.toContain(sensitive);
    }
    expect(clearedCookieNames()).toHaveLength(4);
  });

  it("replaces an unsafe return cookie with the safe default", async () => {
    cookieValues.line_return_to = "%2F%2Fevil.example";
    stateSelectResult.data!.return_path = "/dashboard";
    const response = await GET(callbackUrl("state=expected-state&code=signed-code"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
  });

  it("preserves the existing invitation binding behavior", async () => {
    cookieValues.line_invitation = "opaque-invitation-token";
    cookieValues.line_return_to = "/join";
    stateSelectResult.data!.invitation_token_hash = digest("opaque-invitation-token");
    stateSelectResult.data!.return_path = "/join";
    const response = await GET(callbackUrl("state=expected-state&code=signed-code"));
    expect(mocks.rpc).toHaveBeenCalledWith("bind_line_identity_from_invitation", expect.objectContaining({
      p_token: "opaque-invitation-token",
      p_provider_subject: "Utest12345678",
    }));
    expect(response.headers.get("location")).toBe("http://localhost:3000/join?token=opaque-invitation-token");
  });

  it("fails generically when Supabase session creation fails", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { message: "supabase-refresh-token-detail" } });
    const response = await GET(callbackUrl("state=expected-state&code=signed-code"));
    expect(response.headers.get("location")).toContain("line_login_failed");
    expect(response.headers.get("location")).not.toContain("supabase-refresh-token-detail");
  });

  it("signs out a newly created session when a later local step fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "recording-failed" } });
    await GET(callbackUrl("state=expected-state&code=signed-code"));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
