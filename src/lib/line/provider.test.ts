import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLineAuthorizationUrl,
  createOAuthSecrets,
  exchangeLineCode,
  lineMode,
  signMockAuthorization,
} from "./provider";

const MOCK_SECRET = "test-only-line-mock-signing-secret-123456";

function configureMock() {
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("LINE_LOGIN_MODE", "mock");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("LINE_MOCK_SIGNING_SECRET", MOCK_SECRET);
}

function configureLine() {
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("LINE_LOGIN_MODE", "line");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "1234567890");
  vi.stubEnv("LINE_LOGIN_CHANNEL_SECRET", "server-only-channel-secret");
  vi.stubEnv("LINE_LOGIN_CALLBACK_URL", "http://localhost:3000/api/auth/line/callback");
}

function providerResponses(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1_000);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ id_token: "provider-id-token" }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({
      iss: "https://access.line.me",
      sub: "Utest12345678",
      aud: "1234567890",
      exp: now + 300,
      iat: now,
      nonce: "expected-nonce",
      name: "測試社員",
      picture: "https://profile.line-scdn.net/test",
      email: "member@example.test",
      ...overrides,
    }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("LINE Login provider boundary", () => {
  beforeEach(configureMock);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates different high-entropy OAuth values", () => {
    const first = createOAuthSecrets();
    const second = createOAuthSecrets();
    expect(first.state).not.toBe(first.nonce);
    expect(first.state.length).toBeGreaterThanOrEqual(43);
    expect(second).not.toEqual(first);
  });

  it("creates a localhost mock authorization URL", () => {
    const url = new URL(createLineAuthorizationUrl("state-value", "nonce-value"));
    expect(url.pathname).toBe("/line/mock");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("nonce")).toBe("nonce-value");
  });

  it("signs and verifies a local mock profile", async () => {
    const code = signMockAuthorization({
      subject: "Utest12345678",
      displayName: "測試社員",
      email: "member@example.test",
    }, "nonce");
    await expect(exchangeLineCode(code, "nonce")).resolves.toMatchObject({
      subject: "Utest12345678",
      displayName: "測試社員",
    });
    await expect(exchangeLineCode(`${code}tampered`, "nonce")).rejects.toThrow("mock authorization failed");
    await expect(exchangeLineCode(code, "other-nonce")).rejects.toThrow("mock authorization failed");
  });

  it("fails closed when mock mode is non-local or production", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://identity.example.com");
    expect(lineMode).toThrow("mock provider is unavailable");
    vi.stubEnv("APP_ENV", "production");
    expect(lineMode).toThrow("mock provider is unavailable");
  });

  it("requires a dedicated sufficiently long mock secret", () => {
    vi.stubEnv("LINE_MOCK_SIGNING_SECRET", "short");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-not-be-used-for-line-signing");
    expect(lineMode).toThrow("mock configuration is invalid");
  });

  it("builds a real authorization URL without exposing the channel secret", () => {
    configureLine();
    const url = createLineAuthorizationUrl("state", "nonce");
    expect(url).toContain("https://access.line.me/oauth2/v2.1/authorize");
    expect(url).toContain("client_id=1234567890");
    expect(url).not.toContain("server-only-channel-secret");
  });

  it("rejects a malformed callback URL", () => {
    configureLine();
    vi.stubEnv("LINE_LOGIN_CALLBACK_URL", "http://localhost:3000/api/auth/line/callback?untrusted=value");
    expect(() => createLineAuthorizationUrl("state", "nonce")).toThrow("callback URL is invalid");
  });

  it("validates a real provider verification response with timeouts", async () => {
    configureLine();
    const fetchMock = providerResponses();
    await expect(exchangeLineCode("authorization-code", "expected-nonce")).resolves.toEqual({
      subject: "Utest12345678",
      displayName: "測試社員",
      pictureUrl: "https://profile.line-scdn.net/test",
      email: "member@example.test",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["wrong issuer", { iss: "https://evil.example" }],
    ["wrong audience", { aud: "other-channel" }],
    ["expired token", { exp: 1 }],
    ["nonce mismatch", { nonce: "other-nonce" }],
  ])("rejects %s claims", async (_label, claims) => {
    configureLine();
    providerResponses(claims);
    await expect(exchangeLineCode("authorization-code", "expected-nonce"))
      .rejects.toThrow("ID token verification failed");
  });

  it.each([
    ["missing subject", { sub: null }],
    ["malformed subject", { sub: "browser-selected-subject" }],
    ["insecure picture", { picture: "http://profile.example/image" }],
  ])("rejects %s in the provider profile", async (_label, claims) => {
    configureLine();
    providerResponses(claims);
    await expect(exchangeLineCode("authorization-code", "expected-nonce"))
      .rejects.toThrow("identity response is invalid");
  });
});
