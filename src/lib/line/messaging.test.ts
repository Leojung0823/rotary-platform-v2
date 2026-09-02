import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MULTICAST_RECIPIENT_LIMIT, sendLineOaMessage, verifyLineWebhookSignature } from "./messaging";

type StubResponse = { status: number; headers?: Record<string, string> };

function stubProvider(responses: StubResponse[]) {
  const calls: { retryKey: string; body: Record<string, unknown> }[] = [];
  const queue = [...responses];
  const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers as HeadersInit);
    calls.push({
      retryKey: headers.get("x-line-retry-key") ?? "",
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    const next = queue.shift() ?? { status: 200 };
    return new Response(null, {
      status: next.status,
      headers: { "x-line-request-id": `req-${calls.length}`, ...(next.headers ?? {}) },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function liveEnvironment() {
  process.env.LINE_OA_MODE = "line";
  process.env.NEXT_PUBLIC_SITE_URL = "https://staging.rotary.example.com";
}

function recipients(count: number) {
  return Array.from({ length: count }, (_, index) => `U${String(index).padStart(32, "0")}`);
}

describe("LINE Official Account boundary", () => {
  afterEach(() => {
    delete process.env.LINE_OA_MODE;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it("refuses to reach the live API from a local site url", async () => {
    process.env.LINE_OA_MODE = "line";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    const calls = stubProvider([{ status: 200 }]);
    await expect(
      sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }], { accessToken: "token" }),
    ).rejects.toThrow("non-local site");
    expect(calls).toHaveLength(0);
  });

  it("splits a multicast into batches within the provider recipient limit", async () => {
    liveEnvironment();
    const audience = recipients(MULTICAST_RECIPIENT_LIMIT + 1);
    const calls = stubProvider([{ status: 200 }, { status: 200 }]);

    const result = await sendLineOaMessage("multicast", audience, [{ type: "text", text: "測試" }], {
      accessToken: "token",
    });

    expect(calls).toHaveLength(2);
    expect((calls[0].body.to as string[]).length).toBe(MULTICAST_RECIPIENT_LIMIT);
    expect((calls[1].body.to as string[]).length).toBe(1);
    expect(result).toMatchObject({
      status: "sent",
      batchCount: 2,
      sentBatchCount: 2,
      deliveredRecipientCount: MULTICAST_RECIPIENT_LIMIT + 1,
    });
  });

  it("separates a rejected token from a quota limit and a provider outage", async () => {
    liveEnvironment();

    stubProvider([{ status: 401 }]);
    await expect(
      sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }], { accessToken: "token" }),
    ).resolves.toMatchObject({ status: "failed", failureCode: "credentials_rejected" });

    stubProvider([{ status: 429, headers: { "retry-after": "1" } }, { status: 429 }]);
    await expect(
      sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }], { accessToken: "token" }),
    ).resolves.toMatchObject({ status: "failed", failureCode: "rate_limited", retryAfterSeconds: 1 });

    stubProvider([{ status: 400 }]);
    await expect(
      sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }], { accessToken: "token" }),
    ).resolves.toMatchObject({ status: "failed", failureCode: "request_rejected" });

    stubProvider([{ status: 503 }, { status: 503 }]);
    await expect(
      sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }], { accessToken: "token" }),
    ).resolves.toMatchObject({ status: "failed", failureCode: "provider_unavailable" });
  });

  it("retries a recoverable failure once under the same retry key", async () => {
    liveEnvironment();
    const calls = stubProvider([{ status: 503 }, { status: 200 }]);

    const result = await sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }], {
      accessToken: "token",
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].retryKey).toBe(calls[1].retryKey);
    expect(calls[0].retryKey).not.toBe("");
    expect(result).toMatchObject({ status: "sent", sentBatchCount: 1 });
  });

  it("does not retry a rejected request and stops a batched send on a quota limit", async () => {
    liveEnvironment();
    const rejected = stubProvider([{ status: 400 }, { status: 200 }]);
    await sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }], { accessToken: "token" });
    expect(rejected).toHaveLength(1);

    const audience = recipients(MULTICAST_RECIPIENT_LIMIT + 1);
    const limited = stubProvider([{ status: 200 }, { status: 429 }, { status: 429 }]);
    const result = await sendLineOaMessage("multicast", audience, [{ type: "text", text: "測試" }], {
      accessToken: "token",
    });

    // The first batch landed, the second hit the limit and the send stopped
    // there; the log has to show a partial delivery rather than a clean failure.
    expect(limited.length).toBe(3);
    expect(result).toMatchObject({
      status: "failed",
      failureCode: "rate_limited",
      batchCount: 2,
      sentBatchCount: 1,
      deliveredRecipientCount: MULTICAST_RECIPIENT_LIMIT,
    });
  });

  it("reports a provider timeout instead of hanging the caller", async () => {
    liveEnvironment();
    vi.stubGlobal("fetch", vi.fn(async () => {
      const error = new Error("timed out");
      error.name = "TimeoutError";
      throw error;
    }));

    await expect(
      sendLineOaMessage("broadcast", [], [{ type: "text", text: "測試" }], { accessToken: "token" }),
    ).resolves.toMatchObject({ status: "failed", failureCode: "provider_timeout" });
  });

  it("never places the access token anywhere but the authorization header", async () => {
    liveEnvironment();
    const calls = stubProvider([{ status: 200 }]);
    const result = await sendLineOaMessage("multicast", recipients(2), [{ type: "text", text: "測試" }], {
      accessToken: "super-secret-token",
    });

    expect(JSON.stringify(calls[0].body)).not.toContain("super-secret-token");
    expect(JSON.stringify(result)).not.toContain("super-secret-token");
  });
});
