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
  verifyOtp: vi.fn(),
  sessionRpc: vi.fn(),
  signOut: vi.fn(),
}));

let cookieValues: Record<string, string>;
let stateCalls: number;
let identityResult: { data: Record<string, unknown> | null; error: unknown };
let accountResult: { data: Record<string, unknown> | null; error: unknown };

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
    for (const name of ["line_oauth_state", "line_oauth_nonce", "line_invitation", "line_return_to"]) {
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
    auth: { verifyOtp: mocks.verifyOtp, signOut: mocks.signOut },
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
    };
    stateCalls = 0;
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
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.adminRpc.mockResolvedValue({ data: {}, error: null });
    mocks.sessionRpc.mockResolvedValue({ data: "device-id", error: null });
    mocks.signOut.mockResolvedValue({ error: null });

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

  it("logs in an existing active LINE identity without creating a new Auth user", async () => {
    const response = await GET(callback("state=expected-state&code=signed-code"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).toHaveBeenCalled();
  });

  it("rejects an unknown LINE identity without creating an account", async () => {
    identityResult = { data: null, error: null };
    const response = await GET(callback("state=expected-state&code=signed-code"));
    expect(response.headers.get("location")).toContain("line_login_failed");
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("completes trusted invitation binding before establishing the session", async () => {
    cookieValues.line_invitation = "a".repeat(64);
    cookieValues.line_return_to = "/join";
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

  it("deletes a newly created Auth user when trusted binding fails", async () => {
    cookieValues.line_invitation = "b".repeat(64);
    cookieValues.line_return_to = "/join";
    accountResult = { data: null, error: null };
    mocks.adminRpc.mockResolvedValue({ data: null, error: { message: "binding-failed" } });

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
