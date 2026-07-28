import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { verifyLineWebhookSignature } from "@/lib/line/messaging";
import { readServerSecret } from "@/lib/line/oa-runtime";
import { createTrustedAdminClient } from "@/lib/supabase/admin";

type LineEvent = {
  type?: string;
  webhookEventId?: string;
  source?: { userId?: string };
  timestamp?: number;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const rawBody = await request.text();
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
  let payload: { events?: LineEvent[] } = {};
  let validJson = true;
  try {
    payload = JSON.parse(rawBody) as { events?: LineEvent[] };
  } catch {
    validJson = false;
  }

  const events = payload.events?.length ? payload.events : [{ type: validJson ? "verify" : "invalid_json" }];
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");

  for (const event of events) {
    const accepted = signatureValid && validJson;
    const log = await admin
      .from("line_webhooks")
      .insert({
        line_oa_account_id: account.data.id,
        club_id: clubId,
        event_type: event.type ?? "unknown",
        provider_event_id: event.webhookEventId ?? null,
        signature_valid: signatureValid,
        payload_hash: payloadHash,
        processing_status: accepted ? "received" : "ignored",
        failure_code: !signatureValid ? "invalid_signature" : validJson ? null : "invalid_json",
      })
      .select("id")
      .maybeSingle();

    if (!accepted || log.error) continue;
    const userId = event.source?.userId;
    if (event.type === "follow" && userId) {
      await admin.from("line_oa_followers").upsert(
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
    }
    if (event.type === "unfollow" && userId) {
      await admin
        .from("line_oa_followers")
        .update({ follower_status: "unpaired", unpaired_at: new Date().toISOString() })
        .eq("line_oa_account_id", account.data.id)
        .eq("oa_user_id", userId);
    }
    await admin
      .from("line_webhooks")
      .update({ processing_status: "processed", processed_at: new Date().toISOString() })
      .eq("id", log.data?.id);
  }

  if (!signatureValid) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  if (!validJson) return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
