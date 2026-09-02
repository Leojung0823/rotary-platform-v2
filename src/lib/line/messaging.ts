import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type PushKind = "broadcast" | "multicast" | "push" | "reply";
export type MessagePayload =
  | { type: "text"; text: string }
  | { type: "flex"; altText: string; contents: Record<string, unknown> };

/**
 * Why a delivery failed, in terms the push log can be read back with. A single
 * `provider_error` cannot tell an expired access token apart from a monthly
 * quota that ran out, and those need different actions from an officer.
 */
export type DeliveryFailureCode =
  | "credentials_rejected"
  | "rate_limited"
  | "request_rejected"
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_error";

export type LineDeliveryResult = {
  status: "sent" | "mocked" | "failed";
  requestId?: string;
  failureCode?: DeliveryFailureCode;
  retryAfterSeconds?: number;
  /** Batches the send was split into, so a partial delivery is visible in the log. */
  batchCount: number;
  sentBatchCount: number;
  deliveredRecipientCount: number;
};

/** LINE rejects a multicast carrying more than 500 userIds in one request. */
export const MULTICAST_RECIPIENT_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RETRY_DELAY_MS = 2_000;
const DEFAULT_RETRY_DELAY_MS = 500;
const RETRYABLE_FAILURES: ReadonlySet<DeliveryFailureCode> = new Set([
  "rate_limited",
  "provider_unavailable",
  "provider_timeout",
]);

function isLocalSite(siteUrl: string) {
  try {
    return ["localhost", "127.0.0.1"].includes(new URL(siteUrl).hostname);
  } catch {
    return false;
  }
}

function classifyResponse(status: number): DeliveryFailureCode {
  if (status === 401 || status === 403) return "credentials_rejected";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "request_rejected";
}

function readRetryAfterSeconds(response: Response) {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function chunkRecipients(kind: PushKind, recipients: string[]) {
  if (kind !== "multicast") return [recipients];
  const batches: string[][] = [];
  for (let index = 0; index < recipients.length; index += MULTICAST_RECIPIENT_LIMIT) {
    batches.push(recipients.slice(index, index + MULTICAST_RECIPIENT_LIMIT));
  }
  return batches;
}

async function wait(milliseconds: number) {
  if (milliseconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type BatchOutcome =
  | { ok: true; requestId?: string }
  | { ok: false; failureCode: DeliveryFailureCode; retryAfterSeconds?: number };

async function postBatch(
  endpoint: string,
  token: string,
  body: Record<string, unknown>,
  retryKey: string,
): Promise<BatchOutcome> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        // Reused across retries of this same batch so LINE discards the duplicate
        // instead of delivering the message twice.
        "x-line-retry-key": retryKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, failureCode: timedOut ? "provider_timeout" : "provider_unavailable" };
  }

  if (response.ok) {
    return { ok: true, requestId: response.headers.get("x-line-request-id") ?? undefined };
  }
  return {
    ok: false,
    failureCode: classifyResponse(response.status),
    retryAfterSeconds: readRetryAfterSeconds(response),
  };
}

async function deliverBatch(endpoint: string, token: string, body: Record<string, unknown>) {
  const retryKey = randomUUID();
  const first = await postBatch(endpoint, token, body, retryKey);
  if (first.ok || !RETRYABLE_FAILURES.has(first.failureCode)) return first;

  const delay = first.retryAfterSeconds === undefined
    ? DEFAULT_RETRY_DELAY_MS
    : Math.min(first.retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS);
  await wait(delay);
  const second = await postBatch(endpoint, token, body, retryKey);
  return second.ok ? second : first;
}

export async function sendLineOaMessage(
  kind: PushKind,
  recipients: string[],
  messages: MessagePayload[],
  options: { accessToken?: string; replyToken?: string } = {},
): Promise<LineDeliveryResult> {
  const mode = process.env.LINE_OA_MODE ?? "mock";
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (mode === "mock") {
    if (!isLocalSite(site)) {
      throw new Error("LINE OA mock is local-only.");
    }
    const batches = chunkRecipients(kind, recipients);
    return {
      status: "mocked",
      requestId: `mock-${randomUUID()}`,
      batchCount: batches.length,
      sentBatchCount: batches.length,
      deliveredRecipientCount: recipients.length,
    };
  }

  const token = options.accessToken?.trim();
  if (!token) throw new Error("LINE OA access token is missing.");
  if (kind === "push" && recipients.length !== 1) throw new Error("LINE push requires exactly one recipient.");
  if (kind === "multicast" && recipients.length === 0) throw new Error("LINE multicast requires recipients.");
  if (kind === "reply" && !options.replyToken) throw new Error("LINE reply token is missing.");
  // The mirror of the mock guard: a local site pointed at the real API would send
  // real messages to real members from a development machine.
  if (isLocalSite(site)) throw new Error("LINE OA live mode requires a non-local site URL.");

  const endpoint = `https://api.line.me/v2/bot/message/${kind}`;
  const batches = chunkRecipients(kind, recipients);

  let requestId: string | undefined;
  let sentBatchCount = 0;
  let deliveredRecipientCount = 0;
  let failureCode: DeliveryFailureCode | undefined;
  let retryAfterSeconds: number | undefined;

  for (const batch of batches) {
    const body: Record<string, unknown> = { messages };
    if (kind === "push") body.to = batch[0];
    if (kind === "multicast") body.to = batch;
    if (kind === "reply") body.replyToken = options.replyToken;

    const outcome = await deliverBatch(endpoint, token, body);
    if (outcome.ok) {
      sentBatchCount += 1;
      // A broadcast is not addressed to anyone in particular, so the reachable
      // followers the caller counted are the best statement of what it reached.
      deliveredRecipientCount += kind === "multicast" || kind === "push" ? batch.length : recipients.length;
      requestId ??= outcome.requestId;
      continue;
    }

    failureCode ??= outcome.failureCode;
    retryAfterSeconds ??= outcome.retryAfterSeconds;
    // Credentials are rejected for every batch alike, and a rate limit only gets
    // worse by pushing harder, so stop instead of burning the remaining batches.
    if (outcome.failureCode === "credentials_rejected" || outcome.failureCode === "rate_limited") break;
  }

  const status = failureCode ? "failed" : "sent";
  return {
    status,
    requestId,
    failureCode,
    retryAfterSeconds,
    batchCount: batches.length,
    sentBatchCount,
    deliveredRecipientCount,
  };
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
