import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveLineOaAccessToken,
  resolveLineOaWebhookSecret,
  sendLineOaMessage,
  verifyLineWebhookSignature,
} from "./messaging";

const credentialRef = "abcdef0123456789abcdef01";
const tokenEnv = "LINE_OA_ACCOUNT_ABCDEF0123456789ABCDEF01_ACCESS_TOKEN";
const secretEnv = "LINE_OA_ACCOUNT_ABCDEF0123456789ABCDEF01_CHANNEL_SECRET";

describe("LINE Official Account boundary", () => {
  afterEach(() => {
    delete process.env.LINE_OA_MODE;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env[tokenEnv];
    delete process.env[secretEnv];
    delete process.env.LINE_OA_CHANNEL_ACCESS_TOKEN;
    delete process.env.LINE_OA_CHANNEL_SECRET;
    vi.restoreAllMocks();
  });

  it("verifies the exact raw webhook body with the selected account secret", () => {
    const secret = "account-webhook-secret";
    const body = '{"events":[]}';
    const signature = createHmac("sha256", secret).update(body).digest("base64");
    expect(verifyLineWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyLineWebhookSignature(`${body}\n`, signature, secret)).toBe(false);
    expect(verifyLineWebhookSignature(body, signature, "other-account-secret")).toBe(false);
  });

  it("resolves only the selected account credential reference", () => {
    process.env[tokenEnv] = "account-access-token";
    process.env[secretEnv] = "account-channel-secret";
    expect(resolveLineOaAccessToken(credentialRef)).toBe("account-access-token");
    expect(resolveLineOaWebhookSecret(credentialRef)).toBe("account-channel-secret");
  });

  it("does not fall back to global OA credentials", () => {
    process.env.LINE_OA_CHANNEL_ACCESS_TOKEN = "legacy-global-token";
    process.env.LINE_OA_CHANNEL_SECRET = "legacy-global-secret";
    expect(() => resolveLineOaAccessToken(credentialRef)).toThrow("account access token is missing");
    expect(() => resolveLineOaWebhookSecret(credentialRef)).toThrow("account channel secret is missing");
  });

  it("rejects invalid credential references before environment lookup", () => {
    expect(() => resolveLineOaAccessToken("LINE_OA_CHANNEL_ACCESS_TOKEN")).toThrow("credential reference is invalid");
    expect(() => resolveLineOaWebhookSecret("../secret")).toThrow("credential reference is invalid");
  });

  it("mocks delivery only on localhost", async () => {
    process.env.LINE_OA_MODE = "mock";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    await expect(sendLineOaMessage(
      credentialRef,
      "broadcast",
      [],
      [{ type: "text", text: "測試" }],
    )).resolves.toMatchObject({ status: "mocked" });

    process.env.NEXT_PUBLIC_SITE_URL = "https://identity.example.com";
    await expect(sendLineOaMessage(
      credentialRef,
      "broadcast",
      [],
      [{ type: "text", text: "測試" }],
    )).rejects.toThrow("local-only");
  });

  it("uses the account token for real delivery", async () => {
    process.env.LINE_OA_MODE = "line";
    process.env[tokenEnv] = "account-access-token";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, {
      status: 200,
      headers: { "x-line-request-id": "request-id" },
    }));

    await expect(sendLineOaMessage(
      credentialRef,
      "push",
      ["Urecipient"],
      [{ type: "text", text: "測試" }],
    )).resolves.toEqual({ status: "sent", requestId: "request-id" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.line.me/v2/bot/message/push",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer account-access-token" }),
      }),
    );
  });
});
