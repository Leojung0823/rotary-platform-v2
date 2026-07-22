import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { sendLineOaMessage, verifyLineWebhookSignature } from "./messaging";

describe("LINE Official Account boundary", () => {
  afterEach(() => { delete process.env.LINE_OA_MODE; delete process.env.LINE_OA_CHANNEL_SECRET; delete process.env.NEXT_PUBLIC_SITE_URL; });
  it("verifies the exact raw webhook body with HMAC-SHA256", () => {
    process.env.LINE_OA_CHANNEL_SECRET = "webhook-secret"; const body = '{"events":[]}';
    const signature = createHmac("sha256", "webhook-secret").update(body).digest("base64");
    expect(verifyLineWebhookSignature(body, signature)).toBe(true);
    expect(verifyLineWebhookSignature(`${body}\n`, signature)).toBe(false);
  });
  it("mocks delivery only on localhost", async () => {
    process.env.LINE_OA_MODE = "mock"; process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    await expect(sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }])).resolves.toMatchObject({ status: "mocked" });
    process.env.NEXT_PUBLIC_SITE_URL = "https://identity.example.com";
    await expect(sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }])).rejects.toThrow("local-only");
  });
});
