import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLineAuthorizationUrl, exchangeLineCode, signMockAuthorization } from "./provider";

describe("local LINE Login provider", () => {
  beforeEach(() => { process.env.LINE_LOGIN_MODE = "mock"; process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000"; process.env.LINE_MOCK_SIGNING_SECRET = "test-only-signing-secret"; });
  afterEach(() => { delete process.env.LINE_LOGIN_MODE; delete process.env.NEXT_PUBLIC_SITE_URL; delete process.env.LINE_MOCK_SIGNING_SECRET; });
  it("creates a localhost authorization URL without real LINE credentials", () => {
    const url = new URL(createLineAuthorizationUrl("state-value", "nonce-value"));
    expect(url.pathname).toBe("/line/mock"); expect(url.searchParams.get("state")).toBe("state-value"); expect(url.searchParams.get("nonce")).toBe("nonce-value");
  });
  it("signs and verifies a one-time mock profile", async () => {
    const code = signMockAuthorization({ subject: "Utest12345678", displayName: "測試社員", email: "member@example.test" }, "nonce");
    await expect(exchangeLineCode(code, "nonce")).resolves.toMatchObject({ subject: "Utest12345678", displayName: "測試社員" });
    await expect(exchangeLineCode(`${code}tampered`, "nonce")).rejects.toThrow();
    await expect(exchangeLineCode(code, "other-nonce")).rejects.toThrow("Expired mock authorization code");
  });
  it("fails closed when mock mode is configured on a non-local site", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://identity.example.com";
    expect(() => createLineAuthorizationUrl("state", "nonce")).toThrow("restricted to localhost");
  });
  it("requires a dedicated mock secret instead of reusing another privileged key", () => {
    delete process.env.LINE_MOCK_SIGNING_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "must-not-be-used-for-line-signing";
    expect(() => signMockAuthorization({ subject: "Utest12345678", displayName: "測試社員" }, "nonce"))
      .toThrow("Mock signing secret is missing");
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
});
