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
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LINE_LOGIN_MODE", "mock");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("LINE_MOCK_SIGNING_SECRET", MOCK_SECRET);
}

function configureLine() {
  vi.stubEnv("APP_ENV", "local");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LINE_LOGIN_MODE", "line");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("LINE_LOGIN_CHANNEL_ID", "1234567890");
  vi.stubEnv("LINE_LOGIN_CHANNEL_SECRET", "server-only-channel-secret");
  vi.stubEnv("LINE_LOGIN_CALLBACK_URL", "http://localhost:3000/api/auth/line/callback");
}

function providerResponses(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1_000);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: "provider-access-token",
      refresh_token: "provider-refresh-token",
      id_token: "provider-id-token",
    }), { status: 200, headers: { "content-type": "application/json" } }))
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
    }), { status: 200, headers: { "content-type": "application/json" } }));
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

  it("creates different high-entropy OAuth state and nonce values", () => {
    const first = createOAuthSecrets();
    const second = createOAuthSecrets();
    expect(first.state).not.toBe(first.nonce);
    expect(first.state.length).toBeGreaterThanOrEqual(43);
    expect(first.nonce.length).toBeGreaterThanOrEqual(43);
    expect(second).not.toEqual(first);
  });

  it("creates a localhost mock authorization URL without real credentials", () => {
    const url = new URL(createLineAuthorizationUrl("state-value", "nonce-value"));
    expect(url.pathname).toBe("/line/mock");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("nonce")).toBe("nonce-value");
    expect(url.toString()).not.toContain("channel-secret");
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
  });

  it("rejects a tampered mock signature", async () => {
    const code = signMockAuthorization({ subject: "Utest12345678", displayName: "測試社員" }, "nonce");
    await expect(exchangeLineCode(`${code}tampered`, "nonce")).rejects.toThrow("mock authorization failed");
  });

  it("rejects a mock nonce mismatch", async () => {
    const code = signMockAuthorization({ subject: "Utest12345678", displayName: "測試社員" }, "nonce");
    await expect(exchangeLineCode(code, "other-nonce")).rejects.toThrow("mock authorization failed");
  });

  it("rejects an unsigned mock payload", async () => {
    await expect(exchangeLineCode("unsigned", "nonce")).rejects.toThrow("mock authorization failed");
  });

  it("fails closed when mock mode is configured on a non-local site", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://identity.example.com");
    expect(lineMode).toThrow("mock provider is unavailable");
  });

  it("fails closed when mock mode is configured in APP_ENV production", () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://identity.example.com");
    expect(lineMode).toThrow("mock provider is unavailable");
  });

  it("fails closed when mock mode is configured in a production Node runtime", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://identity.example.com");
    expect(lineMode).toThrow("mock provider is unavailable");
  });

  it("requires a dedicated sufficiently long mock secret", () => {
    vi.stubEnv("LINE_MOCK_SIGNING_SECRET", "short");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "must-not-be-used-for-line-signing");
    expect(lineMode).toThrow("mock configuration is invalid");
  });

  it("does not automatically fall back to mock in production", () => {
    vi.stubEnv("LINE_LOGIN_MODE", "");
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://identity.example.com");
    expect(lineMode).toThrow("mock provider is unavailable");
  });

  it("builds a real authorization URL without the channel secret", () => {
    configureLine();
    const url = createLineAuthorizationUrl("state", "nonce");
    expect(url).toContain("https://access.line.me/oauth2/v2.1/authorize");
    expect(url).toContain("client_id=1234567890");
    expect(url).not.toContain("server-only-channel-secret");
  });

  it("rejects a callback URL containing query data", () => {
    configureLine();
    vi.stubEnv("LINE_LOGIN_CALLBACK_URL", "http://localhost:3000/api/auth/line/callback?untrusted=value");
    expect(() => createLineAuthorizationUrl("state", "nonce")).toThrow("callback URL is invalid");
  });

  it("validates a real provider verification response", async () => {
    configureLine();
    providerResponses();
    await expect(exchangeLineCode("authorization-code", "expected-nonce")).resolves.toEqual({
      subject: "Utest12345678",
      displayName: "測試社員",
      pictureUrl: "https://profile.line-scdn.net/test",
      email: "member@example.test",
    });
  });

  it("uses server-only token and verify endpoints with timeouts", async () => {
    configureLine();
    const fetchMock = providerResponses();
    await exchangeLineCode("authorization-code", "expected-nonce");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.line.me/oauth2/v2.1/token");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", cache: "no-store" });
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("genericizes a non-2xx token response without exposing its body", async () => {
    configureLine();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error_description: "provider-secret-detail" }),
      { status: 400 },
    )));
    const error = await exchangeLineCode("authorization-code", "expected-nonce").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("provider request failed");
    expect((error as Error).message).not.toContain("provider-secret-detail");
  });

  it("rejects an invalid ID-token signature response", async () => {
    configureLine();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id_token: "invalid-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error_description: "Invalid IdToken." }), { status: 400 })));
    await expect(exchangeLineCode("authorization-code", "expected-nonce"))
      .rejects.toThrow("provider request failed");
  });

  it.each([
    ["wrong issuer", { iss: "https://evil.example" }],
    ["wrong audience", { aud: "other-channel" }],
    ["expired token", { exp: 1 }],
    ["future issued-at", { iat: Math.floor(Date.now() / 1_000) + 3_600 }],
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
    ["oversized display name", { name: "x".repeat(101) }],
  ])("rejects %s in provider profile", async (_label, claims) => {
    configureLine();
    providerResponses(claims);
    await expect(exchangeLineCode("authorization-code", "expected-nonce"))
      .rejects.toThrow("identity response is invalid");
  });
});
