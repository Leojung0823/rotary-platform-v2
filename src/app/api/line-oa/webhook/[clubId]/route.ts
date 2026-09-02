import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { verifyLineWebhookSignature } from "@/lib/line/messaging";
import { readServerSecret } from "@/lib/line/oa-runtime";
import { createTrustedAdminClient } from "@/lib/supabase/admin";

const MAX_WEBHOOK_BYTES = 256 * 1024;
const MAX_WEBHOOK_EVENTS = 100;
const MAX_WEBHOOK_REQUESTS_PER_MINUTE = 120;

type LineEvent = {
  type?: string;
  webhookEventId?: string;
  source?: { userId?: string };
  timestamp?: number;
};

type WebhookClaim = { log_id: number; should_process: boolean };

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
  let rawBody: string;
  try {
    rawBody = await readLimitedBody(request);
  } catch {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const { clubId } = await params;
  const admin = createTrustedAdminClient();
  const account = await admin
    .from("line_oa_accounts")
    .select("id, webhook_secret_env_key")
    .eq("club_id", clubId)
    .neq("account_status", "disabled")
    .maybeSingle();

  if (account.error || !account.data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let webhookSecret: string;
  try {
    webhookSecret = readServerSecret(account.data.webhook_secret_env_key, "LINE OA webhook secret");
  } catch {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const signatureValid = verifyLineWebhookSignature(
    rawBody,
    request.headers.get("x-line-signature"),
    webhookSecret,
  );
  if (!signatureValid) {
    // Invalid unauthenticated traffic must be limited at the edge or reverse proxy.
    // It does not consume the valid OA quota and does not create per-event rows.
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
    const claim = await admin.rpc("claim_line_webhook_event", {
      p_line_oa_account_id: account.data.id,
      p_club_id: clubId,
      p_event_type: event.type ?? "unknown",
      p_provider_event_id: event.webhookEventId ?? null,
      p_payload_hash: payloadHash,
    });
    if (claim.error) {
      const mismatch = claim.error.message.includes("webhook_event_payload_mismatch");
      return NextResponse.json(
        { error: mismatch ? "event_payload_mismatch" : "webhook_persistence_failed" },
        { status: mismatch ? 409 : 503 },
      );
    }

    const claimData = claim.data as WebhookClaim[] | WebhookClaim | null;
    const claimed = Array.isArray(claimData) ? claimData[0] : claimData;
    if (!claimed) {
      return NextResponse.json({ error: "webhook_persistence_failed" }, { status: 503 });
    }
    if (!claimed.should_process) continue;

    const userId = event.source?.userId;
    let failureCode: string | null = null;
    let nonRetryableFailureCode: string | null = null;
    if (event.type === "follow" && userId) {
      const follower = await admin.from("line_oa_followers").upsert(
        {
          line_oa_account_id: account.data.id,
          club_id: clubId,
          oa_user_id: userId,
          follower_status: "following",
          followed_at: new Date(event.timestamp ?? Date.now()).toISOString(),
          unpaired_at: null,
        },
        { onConflict: "line_oa_account_id,oa_user_id" },
      );
      if (follower.error) failureCode = "follower_upsert_failed";
      else {
        // The follower row is already durable. A trusted pairing failure must
        // not make LINE retry the whole webhook and repeat that side effect.
        try {
          const pairing = await admin.rpc("auto_pair_line_oa_follower", {
            p_line_oa_account_id: account.data.id,
            p_club_id: clubId,
            p_oa_user_id: userId,
          });
          if (pairing.error) nonRetryableFailureCode = "auto_pairing_failed";
        } catch {
          nonRetryableFailureCode = "auto_pairing_failed";
        }
      }
    }
    if (event.type === "unfollow" && userId) {
      const follower = await admin
        .from("line_oa_followers")
        .update({ follower_status: "unpaired", unpaired_at: new Date().toISOString() })
        .eq("line_oa_account_id", account.data.id)
        .eq("oa_user_id", userId);
      if (follower.error) failureCode = "follower_update_failed";
    }

    if (failureCode) {
      await admin
        .from("line_webhooks")
        .update({ processing_status: "failed", failure_code: failureCode })
        .eq("id", claimed.log_id);
      return NextResponse.json({ error: "webhook_processing_failed" }, { status: 503 });
    }

    const completed = await admin
      .from("line_webhooks")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        failure_code: nonRetryableFailureCode,
      })
      .eq("id", claimed.log_id);
    if (completed.error) {
      return NextResponse.json({ error: "webhook_persistence_failed" }, { status: 503 });
    }
  }

  return NextResponse.json({ ok: true });
}
