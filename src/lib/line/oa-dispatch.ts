import { createTrustedAdminClient } from "@/lib/supabase/admin";
import { sendLineOaMessage, type LineDeliveryResult, type PushKind } from "./messaging";
import { readServerSecret } from "./oa-runtime";

export type ClubOaDispatchContext = {
  /** Undefined in mock mode; the live API is the only caller that needs it. */
  accessToken?: string;
  followers: string[];
};

export type ClubOaDispatchFailure = "oa_not_configured";

/**
 * Loads everything a club push needs from trusted server state: the account, the
 * followers who can still receive a message, and the per-club access token read
 * from its own environment key. Shared so the server action and the internal API
 * cannot drift into two different ideas of who is reachable.
 *
 * The caller is still responsible for authorizing the actor; this reads state
 * with the admin client and authorizes nobody.
 */
export async function loadClubOaDispatchContext(
  clubId: string,
): Promise<{ ok: true; context: ClubOaDispatchContext } | { ok: false; reason: ClubOaDispatchFailure }> {
  const admin = createTrustedAdminClient();
  const [accountResult, followersResult] = await Promise.all([
    admin
      .from("line_oa_accounts")
      .select("access_token_env_key")
      .eq("club_id", clubId)
      .neq("account_status", "disabled")
      .maybeSingle(),
    admin
      .from("line_oa_followers")
      .select("oa_user_id")
      .eq("club_id", clubId)
      .eq("follower_status", "following"),
  ]);

  if (accountResult.error || !accountResult.data || followersResult.error) {
    return { ok: false, reason: "oa_not_configured" };
  }

  let accessToken: string | undefined;
  if ((process.env.LINE_OA_MODE ?? "mock") === "line") {
    try {
      accessToken = readServerSecret(accountResult.data.access_token_env_key, "LINE OA access token");
    } catch {
      return { ok: false, reason: "oa_not_configured" };
    }
  }

  return {
    ok: true,
    context: {
      accessToken,
      followers: (followersResult.data ?? []).map((row) => row.oa_user_id),
    },
  };
}

export async function deliverClubOaText(
  kind: Extract<PushKind, "broadcast" | "multicast">,
  recipients: string[],
  text: string,
  context: ClubOaDispatchContext,
): Promise<LineDeliveryResult> {
  try {
    return await sendLineOaMessage(kind, recipients, [{ type: "text", text }], {
      accessToken: context.accessToken,
    });
  } catch {
    // A thrown error is a caller-contract or configuration problem, not a
    // provider verdict, so it is recorded without claiming a provider cause.
    return {
      status: "failed",
      failureCode: "provider_error",
      batchCount: 0,
      sentBatchCount: 0,
      deliveredRecipientCount: 0,
    };
  }
}

/**
 * Builds the `record_line_push` arguments so the log keeps why a send failed and
 * how much of a batched send actually landed. `delivery_status` only allows
 * queued/sent/failed/mocked, so partial delivery stays visible in the summary.
 */
export function buildPushLogArgs(
  clubId: string,
  kind: PushKind,
  attemptedRecipientCount: number,
  text: string,
  delivery: LineDeliveryResult,
) {
  return {
    p_club_id: clubId,
    p_push_kind: kind,
    p_recipient_count: attemptedRecipientCount,
    p_payload_summary: {
      message_type: "text",
      character_count: text.length,
      batch_count: delivery.batchCount,
      sent_batch_count: delivery.sentBatchCount,
      delivered_recipient_count: delivery.deliveredRecipientCount,
    },
    p_delivery_status: delivery.status,
    p_provider_request_id: delivery.requestId ?? null,
    p_failure_code: delivery.status === "failed" ? (delivery.failureCode ?? "provider_error") : null,
  };
}
