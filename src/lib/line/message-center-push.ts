import "server-only";

import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessagePushOutcome } from "./message-push-outcome";
import { buildMessagePushLogArgs, deliverClubOaText, loadClubOaDispatchContext } from "./oa-dispatch";

const MAX_LINE_BODY = 900;

/**
 * LINE shows a plain text message with no title, so the title has to be carried
 * in the body or the member sees an unattributed paragraph. Truncation is
 * marked rather than silent: the full text is always in the message centre.
 */
export function composeMessagePushText(title: string, body: string) {
  const trimmed = body.length > MAX_LINE_BODY ? `${body.slice(0, MAX_LINE_BODY)}…` : body;
  const suffix = body.length > MAX_LINE_BODY ? "\n\n（訊息過長，完整內容請到訊息中心查看）" : "";
  return `${title}\n\n${trimmed}${suffix}`;
}

/**
 * Pushes a message centre announcement to the members who were addressed, have
 * paired their LINE account, and left their notification switches on.
 *
 * The caller's session does the authorising: both RPCs require `member.manage`
 * on the club, the same permission that allowed the message to be created.
 * Nothing here can turn a delivered message into a failed one -- the message
 * row is already committed, and an officer who is told the send failed would
 * reasonably send it again.
 */
export async function pushClubMessageToLine({
  supabase,
  clubId,
  messageId,
  title,
  body,
  subjectUuid,
}: {
  supabase: SupabaseClient;
  clubId: string;
  messageId: string;
  title: string;
  body: string;
  subjectUuid?: string;
}): Promise<MessagePushOutcome> {
  const evaluation = await evaluateCurrentFeatureFlag({ key: "line_oa_event_push_v1", subjectUuid });
  if (!evaluation.enabled) return { status: "skipped", reason: "flag_disabled" };

  const dispatch = await loadClubOaDispatchContext(clubId);
  if (!dispatch.ok) return { status: "skipped", reason: "oa_not_configured" };

  const targets = await supabase.rpc("list_club_message_line_targets", {
    p_club_id: clubId,
    p_message_id: messageId,
  });
  if (targets.error) return { status: "failed", reason: "targets_unavailable" };

  const recipients = Array.from(
    new Set(
      ((targets.data ?? []) as { oa_user_id?: unknown }[])
        .map((row) => row.oa_user_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  // Nobody addressed has paired an account. Reported as a skip rather than a
  // delivery of zero, and no push log row is written for a send that never
  // reached the provider.
  if (recipients.length === 0) return { status: "skipped", reason: "no_reachable_recipients" };

  const text = composeMessagePushText(title, body);
  const delivery = await deliverClubOaText("multicast", recipients, text, dispatch.context);

  // Logged before the outcome is judged, so a failed push is still recorded and
  // the per-message unique index still blocks a second attempt.
  const logged = await supabase.rpc(
    "record_club_message_line_push",
    buildMessagePushLogArgs(clubId, messageId, recipients.length, text, delivery),
  );

  if (delivery.status === "failed") {
    return { status: "failed", reason: delivery.failureCode ?? "provider_error" };
  }
  if (logged.error) return { status: "failed", reason: "push_not_recorded" };
  return { status: "sent", recipientCount: delivery.deliveredRecipientCount };
}
