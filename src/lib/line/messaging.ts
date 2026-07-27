import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type PushKind = "broadcast" | "multicast" | "push" | "reply";
export type MessagePayload =
  | { type: "text"; text: string }
  | { type: "flex"; altText: string; contents: Record<string, unknown> };

const CREDENTIAL_REF_PATTERN = /^[a-f0-9]{24}$/;

function credentialEnvName(credentialRef: string, suffix: "ACCESS_TOKEN" | "CHANNEL_SECRET") {
  if (!CREDENTIAL_REF_PATTERN.test(credentialRef)) {
    throw new Error("LINE OA credential reference is invalid.");
  }
  return `LINE_OA_ACCOUNT_${credentialRef.toUpperCase()}_${suffix}`;
}

export function resolveLineOaAccessToken(credentialRef: string) {
  const token = process.env[credentialEnvName(credentialRef, "ACCESS_TOKEN")];
  if (!token) throw new Error("LINE OA account access token is missing.");
  return token;
}

export function resolveLineOaWebhookSecret(credentialRef: string) {
  const secret = process.env[credentialEnvName(credentialRef, "CHANNEL_SECRET")];
  if (!secret) throw new Error("LINE OA account channel secret is missing.");
  return secret;
}

export function sendLineOaMessage(
  credentialRef: string,
  kind: PushKind,
  recipients: string[],
  messages: MessagePayload[],
  replyToken?: string,
): Promise<{ status: "mocked" | "sent"; requestId?: string }>;

/**
 * Compatibility signature for stale callers. It deliberately fails closed at
 * runtime because no account credential reference is available.
 */
export function sendLineOaMessage(
  kind: PushKind,
  recipients: string[],
  messages: MessagePayload[],
  replyToken?: string,
): Promise<never>;

export async function sendLineOaMessage(
  credentialRefOrKind: string,
  kindOrRecipients: PushKind | string[],
  recipientsOrMessages: string[] | MessagePayload[],
  messagesOrReplyToken?: MessagePayload[] | string,
  maybeReplyToken?: string,
) {
  if (Array.isArray(kindOrRecipients)) {
    throw new Error("LINE OA account credential reference is required.");
  }

  const credentialRef = credentialRefOrKind;
  const kind = kindOrRecipients;
  const recipients = recipientsOrMessages as string[];
  const messages = messagesOrReplyToken as MessagePayload[];
  const replyToken = maybeReplyToken;

  const mode = process.env.LINE_OA_MODE ?? "mock";
  if (mode === "mock") {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    if (!["localhost", "127.0.0.1"].includes(new URL(site).hostname)) {
      throw new Error("LINE OA mock is local-only.");
    }
    return { status: "mocked" as const, requestId: `mock-${randomUUID()}` };
  }
  if (mode !== "line") throw new Error("LINE OA mode is invalid.");

  const token = resolveLineOaAccessToken(credentialRef);
  const endpoint = `https://api.line.me/v2/bot/message/${kind}`;
  const body: Record<string, unknown> = { messages };
  if (kind === "push") body.to = recipients[0];
  if (kind === "multicast") body.to = recipients;
  if (kind === "reply") body.replyToken = replyToken;

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
  return {
    status: "sent" as const,
    requestId: response.headers.get("x-line-request-id") ?? undefined,
  };
}

export function verifyLineWebhookSignature(
  rawBody: string,
  suppliedSignature: string | null,
  secret: string,
) {
  if (!suppliedSignature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const actual = Buffer.from(suppliedSignature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
