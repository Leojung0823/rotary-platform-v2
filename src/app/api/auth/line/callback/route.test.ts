import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFrom: vi.fn(),
  adminRpc: vi.fn(),
  cookieSet: vi.fn(),
  exchangeLineCode: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  generateLink: vi.fn(),
  getUser: vi.fn(),
  verifyOtp: vi.fn(),
  sessionRpc: vi.fn(),
  signOut: vi.fn(),
}));

let cookieValues: Record<string, string>;
let stateCalls: number;
let identityResult: { data: Record<string, unknown> | null; error: unknown };
let accountResult: { data: Record<string, unknown> | null; error: unknown };
let invitationKind: "member_join" | "line_rebind";
let accountHasAccess: boolean;

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
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
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

vi.mock("@/lib/line/provider", () => ({
  exchangeLineCode: mocks.exchangeLineCode,
  lineMode: () => "mock",
}));

vi.mock("@/lib/line/security", () => ({
  clearLineOAuthCookies: (store: { set: typeof mocks.cookieSet }) => {
    for (const name of ["line_oauth_state", "line_oauth_nonce", "line_invitation", "line_return_to", "line_flow"]) {
      store.set(name, "", { maxAge: 0 });
    }
  },
  constantTimeEqual: (left: string, right: string) => left === right,
  lineLoginFailureUrl: () => new URL("http://localhost:3000/login?error=line_login_failed"),
  lineOAuthCookieOptions: (maxAge: number) => ({ httpOnly: true, secure: false, sameSite: "lax", path: "/", maxAge }),
  safeLineRedirectPath: (value: string | null | undefined, fallback: string) =>
    value?.startsWith("/") && !value.startsWith("//") ? value : fallback,
  trustedLineRedirectUrl: (path: string) => new URL(path, "http://localhost:3000"),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createTrustedAdminClient: () => ({
    from: mocks.adminFrom,
    rpc: mocks.adminRpc,
    auth: { admin: {
      createUser: mocks.createUser,
      deleteUser: mocks.deleteUser,
      generateLink: mocks.generateLink,
    } },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: mocks.getUser,
      verifyOtp: mocks.verifyOtp,
      signOut: mocks.signOut,
    },
    rpc: mocks.sessionRpc,
  }),
}));

import { GET } from "./route";

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function callback(parameters: string) {
  return new NextRequest(`http://localhost:3000/api/auth/line/callback?${parameters}`);
}

describe("GET /api/auth/line/callback", () => {
  beforeEach(() => {
    vi.stubEnv("APP_ENV", "local");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    cookieValues = {
      line_oauth_state: "expected-state",
      line_oauth_nonce: "expected-nonce",
      line_invitation: "",
      line_return_to: "/dashboard",
      line_flow: "login",
    };
    stateCalls = 0;
    invitationKind = "member_join";
    accountHasAccess = true;
    identityResult = { data: { app_account_id: "account-id" }, error: null };
    accountResult = {
      data: {
        id: "account-id",
        person_id: "person-id",
        auth_user_id: "auth-user-id",
        login_email: "member@example.test",
        account_status: "active",
      },
      error: null,
    };

    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.exchangeLineCode.mockResolvedValue({
      subject: "Utest12345678",
      displayName: "測試社員",
      email: "member@example.test",
    });
    mocks.createUser.mockResolvedValue({ data: { user: { id: "new-auth-user-id" } }, error: null });
    mocks.deleteUser.mockResolvedValue({ data: {}, error: null });
    mocks.generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "hashed-magic-link-token" } },
      error: null,
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-user-id" } } });
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.sessionRpc.mockResolvedValue({ data: "device-id", error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === "account_has_active_access") return { data: accountHasAccess, error: null };
      if (name === "bind_line_identity_from_invitation_trusted") {
        return { data: { invitation_kind: invitationKind, invitation_completed: invitationKind === "line_rebind" }, error: null };
      }
      if (name === "bind_line_identity_to_existing_account_trusted") {
        return { data: { line_identity_id: "line-id" }, error: null };
      }
      return { data: {}, error: null };
    });

    mocks.adminFrom.mockImplementation((table: string) => {
      if (table === "line_oauth_states") {
        stateCalls += 1;
        if (stateCalls === 1) {
          return query({
            data: {
              id: "oauth-state-id",
              nonce_hash: digest("expected-nonce"),
              invitation_token_hash: cookieValues.line_invitation ? digest(cookieValues.line_invitation) : null,
              return_path: cookieValues.line_return_to,
              flow_kind: cookieValues.line_flow,
              initiating_auth_user_id: cookieValues.line_flow === "bind" ? "auth-user-id" : null,
              expires_at: new Date(Date.now() + 300_000).toISOString(),
              consumed_at: null,
            },
            error: null,
          });
        }
        return query({ data: { id: "oauth-state-id" }, error: null });
      }
      if (table === "line_identities") return query(identityResult);
      if (table === "app_accounts") return query(accountResult);
      if (table === "member_invitations") {
        return query({
          data: {
            person_id: "person-id",
            invitation_kind: invitationKind,
            invitation_status: "sent",
            expires_at: new Date(Date.now() + 300_000).toISOString(),
          },
          error: null,
        });
      }
      return query({ data: null, error: null });
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("logs in an existing active LINE identity with active platform access", async () => {
    const response = await GET(callback("state=expected-state&code=signed-code"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(mocks.adminRpc).toHaveBeenCalledWith("account_has_active_access", { p_app_account_id: "account-id" });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).toHaveBeenCalled();
  });

  it("rejects an existing LINE identity after all active access is removed", async () => {
    accountHasAccess = false;
    const response = await GET(callback("state=expected-state&code=signed-code"));
    expect(response.headers.get("location")).toContain("line_login_failed");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("rejects an unknown LINE identity without creating an account", async () => {
    identityResult = { data: null, error: null };
    const response = await GET(callback("state=expected-state&code=signed-code"));
    expect(response.headers.get("location")).toContain("line_login_failed");
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("completes trusted member invitation binding before establishing the session", async () => {
    cookieValues.line_invitation = "a".repeat(64);
    cookieValues.line_return_to = "/join";
    cookieValues.line_flow = "invitation";
    accountResult = { data: null, error: null };
    const response = await GET(callback("state=expected-state&code=signed-code"));

    expect(mocks.adminRpc).toHaveBeenCalledWith("bind_line_identity_from_invitation_trusted", expect.objectContaining({
      p_token: "a".repeat(64),
      p_auth_user_id: "new-auth-user-id",
      p_provider_subject: "Utest12345678",
    }));
    expect(mocks.adminRpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.verifyOtp.mock.invocationCallOrder[0]);
    expect(response.headers.get("location")).toContain("/join?token=");
  });

  it("completes a rebind invitation without returning to the member join form", async () => {
    invitationKind = "line_rebind";
    cookieValues.line_invitation = "b".repeat(64);
    cookieValues.line_return_to = "/join";
    cookieValues.line_flow = "invitation";
    const response = await GET(callback("state=expected-state&code=signed-code"));
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("http://localhost:3000/me?success=line_rebound");
  });

  it("binds LINE to the currently authenticated account without replacing its session", async () => {
    cookieValues.line_flow = "bind";
    cookieValues.line_return_to = "/me";
    const response = await GET(callback("state=expected-state&code=signed-code"));
    expect(mocks.adminRpc).toHaveBeenCalledWith("bind_line_identity_to_existing_account_trusted", expect.objectContaining({
      p_auth_user_id: "auth-user-id",
      p_provider_subject: "Utest12345678",
    }));
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("http://localhost:3000/me?success=line_bound");
  });

  it("rejects a bind callback after the initiating session changes", async () => {
    cookieValues.line_flow = "bind";
    cookieValues.line_return_to = "/me";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "different-user" } } });
    const response = await GET(callback("state=expected-state&code=signed-code"));
    expect(response.headers.get("location")).toContain("line_login_failed");
    expect(mocks.exchangeLineCode).not.toHaveBeenCalled();
  });

  it("deletes a newly created Auth user when trusted invitation binding fails", async () => {
    cookieValues.line_invitation = "c".repeat(64);
    cookieValues.line_return_to = "/join";
    cookieValues.line_flow = "invitation";
    accountResult = { data: null, error: null };
    mocks.adminRpc.mockImplementation(async (name: string) => {
      if (name === "bind_line_identity_from_invitation_trusted") return { data: null, error: { message: "binding-failed" } };
      return { data: true, error: null };
    });

    await GET(callback("state=expected-state&code=signed-code"));
    expect(mocks.deleteUser).toHaveBeenCalledWith("new-auth-user-id");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("terminally consumes provider cancellation without exchanging a code", async () => {
    const response = await GET(callback("state=expected-state&error=access_denied&error_description=private-detail"));
    expect(response.headers.get("location")).toContain("line_login_failed");
    expect(stateCalls).toBe(2);
    expect(mocks.exchangeLineCode).not.toHaveBeenCalled();
  });

  it("keeps an established session when device telemetry fails", async () => {
    mocks.sessionRpc.mockResolvedValue({ data: null, error: { message: "telemetry-failed" } });
    const response = await GET(callback("state=expected-state&code=signed-code"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
