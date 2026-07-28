import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type PushKind = "broadcast" | "multicast" | "push" | "reply";
export type MessagePayload =
  | { type: "text"; text: string }
  | { type: "flex"; altText: string; contents: Record<string, unknown> };

export async function sendLineOaMessage(
  kind: PushKind,
  recipients: string[],
  messages: MessagePayload[],
  options: { accessToken?: string; replyToken?: string } = {},
) {
  const mode = process.env.LINE_OA_MODE ?? "mock";
  if (mode === "mock") {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    if (!["localhost", "127.0.0.1"].includes(new URL(site).hostname)) {
      throw new Error("LINE OA mock is local-only.");
    }
    return { status: "mocked" as const, requestId: `mock-${randomUUID()}` };
  }

  const token = options.accessToken?.trim();
  if (!token) throw new Error("LINE OA access token is missing.");
  if (kind === "push" && recipients.length !== 1) throw new Error("LINE push requires exactly one recipient.");
  if (kind === "multicast" && recipients.length === 0) throw new Error("LINE multicast requires recipients.");
  if (kind === "reply" && !options.replyToken) throw new Error("LINE reply token is missing.");

  const endpoint = `https://api.line.me/v2/bot/message/${kind}`;
  const body: Record<string, unknown> = { messages };
  if (kind === "push") body.to = recipients[0];
  if (kind === "multicast") body.to = recipients;
  if (kind === "reply") body.replyToken = options.replyToken;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-line-retry-key": randomUUID(),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`LINE OA request failed with ${response.status}.`);
  return { status: "sent" as const, requestId: response.headers.get("x-line-request-id") ?? undefined };
}

export function verifyLineWebhookSignature(
  rawBody: string,
  suppliedSignature: string | null,
  channelSecret: string,
) {
  if (!channelSecret || !suppliedSignature) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBody).digest();
  const actual = Buffer.from(suppliedSignature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
