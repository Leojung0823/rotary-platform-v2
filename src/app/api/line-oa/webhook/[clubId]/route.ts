import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { verifyLineWebhookSignature } from "@/lib/line/messaging";

type LineEvent = { type?: string; webhookEventId?: string; source?: { userId?: string }; timestamp?: number };

export async function POST(request: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params; const rawBody = await request.text(); const signatureValid = verifyLineWebhookSignature(rawBody, request.headers.get("x-line-signature"));
  const admin = createTrustedAdminClient(); const account = await admin.from("line_oa_accounts").select("id").eq("club_id", clubId).neq("account_status", "disabled").maybeSingle();
  if (account.error || !account.data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let payload: { events?: LineEvent[] } = {}; try { payload = JSON.parse(rawBody) as { events?: LineEvent[] }; } catch { /* log invalid payload hash below */ }
  const events = payload.events?.length ? payload.events : [{ type: "verify" }]; const payloadHash = createHash("sha256").update(rawBody).digest("hex");
  for (const event of events) {
    const log = await admin.from("line_webhooks").insert({ line_oa_account_id: account.data.id, club_id: clubId,
      event_type: event.type ?? "unknown", provider_event_id: event.webhookEventId ?? null, signature_valid: signatureValid,
      payload_hash: payloadHash, processing_status: signatureValid ? "received" : "ignored",
      failure_code: signatureValid ? null : "invalid_signature" }).select("id").maybeSingle();
    if (!signatureValid || log.error) continue;
    const userId = event.source?.userId;
    if (event.type === "follow" && userId) await admin.from("line_oa_followers").upsert({ line_oa_account_id: account.data.id,
      club_id: clubId, oa_user_id: userId, follower_status: "following", followed_at: new Date(event.timestamp ?? Date.now()).toISOString(),
      unpaired_at: null }, { onConflict: "line_oa_account_id,oa_user_id" });
    if (event.type === "unfollow" && userId) await admin.from("line_oa_followers").update({ follower_status: "unpaired",
      unpaired_at: new Date().toISOString() }).eq("line_oa_account_id", account.data.id).eq("oa_user_id", userId);
    await admin.from("line_webhooks").update({ processing_status: "processed", processed_at: new Date().toISOString() }).eq("id", log.data?.id);
  }
  if (!signatureValid) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
