import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { sendLineOaMessage, verifyLineWebhookSignature } from "./messaging";

describe("LINE Official Account boundary", () => {
  afterEach(() => {
    delete process.env.LINE_OA_MODE;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("verifies the exact raw webhook body with the supplied club secret", () => {
    const body = '{"events":[]}';
    const signature = createHmac("sha256", "club-a-secret").update(body).digest("base64");
    expect(verifyLineWebhookSignature(body, signature, "club-a-secret")).toBe(true);
    expect(verifyLineWebhookSignature(body, signature, "club-b-secret")).toBe(false);
    expect(verifyLineWebhookSignature(`${body}\n`, signature, "club-a-secret")).toBe(false);
  });

  it("mocks delivery only on localhost", async () => {
    process.env.LINE_OA_MODE = "mock";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    await expect(sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }])).resolves.toMatchObject({
      status: "mocked",
    });
    process.env.NEXT_PUBLIC_SITE_URL = "https://identity.example.com";
    await expect(sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }])).rejects.toThrow(
      "local-only",
    );
  });

  it("requires explicit production credentials and valid recipient shapes", async () => {
    process.env.LINE_OA_MODE = "line";
    await expect(sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }])).rejects.toThrow(
      "access token",
    );
    await expect(
      sendLineOaMessage("push", [], [{ type: "text", text: "測試" }], { accessToken: "token" }),
    ).rejects.toThrow("exactly one recipient");
    await expect(
      sendLineOaMessage("reply", [], [{ type: "text", text: "測試" }], { accessToken: "token" }),
    ).rejects.toThrow("reply token");
  });
});
