import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { resolveLineOaWebhookSecret, verifyLineWebhookSignature } from "@/lib/line/messaging";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const MAX_WEBHOOK_EVENTS = 100;
const MAX_WEBHOOK_REQUESTS_PER_MINUTE = 120;

type LineEvent = {
  type?: string;
  webhookEventId?: string;
  source?: { userId?: string };
  timestamp?: number;
};

async function readLimitedBody(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    throw new Error("payload_too_large");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        throw new Error("payload_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const admin = createTrustedAdminClient();
  const account = await admin.from("line_oa_accounts")
    .select("id, credential_ref")
    .eq("club_id", clubId)
    .neq("account_status", "disabled")
    .maybeSingle();
  if (account.error || !account.data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let rawBody: string;
  try {
    rawBody = await readLimitedBody(request);
  } catch {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let secret: string;
  try {
    secret = resolveLineOaWebhookSecret(account.data.credential_ref);
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const signatureValid = verifyLineWebhookSignature(
    rawBody,
    request.headers.get("x-line-signature"),
    secret,
  );
  if (!signatureValid) {
    // Invalid requests are rejected before per-event database writes. Edge or
    // reverse-proxy IP limits must absorb unauthenticated traffic without
    // allowing an attacker to consume the legitimate OA request quota.
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const rateLimit = await admin.rpc("consume_line_webhook_rate_limit", {
    p_line_oa_account_id: account.data.id,
    p_limit: MAX_WEBHOOK_REQUESTS_PER_MINUTE,
  });
  if (rateLimit.error) {
    return NextResponse.json({ error: "rate_limit_unavailable" }, { status: 503 });
  }
  if (rateLimit.data !== true) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(rawBody) as { events?: LineEvent[] };
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const events = payload.events ?? [];
  if (!Array.isArray(events) || events.length > MAX_WEBHOOK_EVENTS) {
    return NextResponse.json({ error: "too_many_events" }, { status: 413 });
  }

  const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  for (const event of events) {
    const row = {
      line_oa_account_id: account.data.id,
      club_id: clubId,
      event_type: event.type ?? "unknown",
      provider_event_id: event.webhookEventId ?? null,
      signature_valid: true,
      payload_hash: payloadHash,
      processing_status: "received",
      failure_code: null,
    };

    const log = event.webhookEventId
      ? await admin.from("line_webhooks").upsert(row, {
        onConflict: "line_oa_account_id,provider_event_id",
        ignoreDuplicates: true,
      }).select("id").maybeSingle()
      : await admin.from("line_webhooks").insert(row).select("id").maybeSingle();

    if (log.error || !log.data) continue;

    const userId = event.source?.userId;
    if (event.type === "follow" && userId) {
      await admin.from("line_oa_followers").upsert({
        line_oa_account_id: account.data.id,
        club_id: clubId,
        oa_user_id: userId,
        follower_status: "following",
        followed_at: new Date(event.timestamp ?? Date.now()).toISOString(),
        unpaired_at: null,
      }, { onConflict: "line_oa_account_id,oa_user_id" });
    }
    if (event.type === "unfollow" && userId) {
      await admin.from("line_oa_followers").update({
        follower_status: "unpaired",
        unpaired_at: new Date().toISOString(),
      }).eq("line_oa_account_id", account.data.id).eq("oa_user_id", userId);
    }

    await admin.from("line_webhooks").update({
      processing_status: "processed",
      processed_at: new Date().toISOString(),
    }).eq("id", log.data.id);
  }

  return NextResponse.json({ ok: true });
}
