import "server-only";

import { evaluateCurrentFeatureFlag } from "@/lib/product/feature-flag-adapter.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessagePushOutcome } from "./message-push-outcome";
import { deliverClubOaText, loadClubOaDispatchContext } from "./oa-dispatch";

const MAX_LOCATION = 60;

function formatStart(startsAt: string) {
  const parsed = new Date(startsAt);
  if (Number.isNaN(parsed.getTime())) return null;
  // 24-hour and with the weekday: a meeting notice is misread more easily than
  // it is read, and "晚上7:30" is one glance away from 9:30.
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

/**
 * A LINE message has no title and no link preview, so the announcement has to
 * read as a whole sentence on its own. Anything the member needs in order to
 * decide whether to go: what, when, where.
 */
export function composeEventPushText(event: {
  title: string;
  location?: string | null;
  startsAt: string;
}) {
  const when = formatStart(event.startsAt);
  const lines = [`【新活動】${event.title}`];
  if (when) lines.push(`時間：${when}`);
  const location = (event.location ?? "").trim();
  if (location) lines.push(`地點：${location.slice(0, MAX_LOCATION)}`);
  lines.push("", "詳細內容與報名請到活動頁面。");
  return lines.join("\n");
}

type EventTargets = {
  title?: unknown;
  location?: unknown;
  starts_at?: unknown;
  event_status?: unknown;
  oa_user_ids?: unknown;
};

/**
 * Pushes a newly published event to the members it was addressed to.
 *
 * Mirrors the message centre push deliberately: the same flag, the same
 * notification switches, the same one-push-per-subject index, and the same rule
 * that a failed push never turns a successful publish into a failure.
 */
export async function pushPublishedEventToLine({
  supabase,
  clubId,
  eventId,
  subjectUuid,
}: {
  supabase: SupabaseClient;
  clubId: string;
  eventId: string;
  subjectUuid?: string;
}): Promise<MessagePushOutcome> {
  const evaluation = await evaluateCurrentFeatureFlag({ key: "line_oa_event_push_v1", subjectUuid });
  if (!evaluation.enabled) return { status: "skipped", reason: "flag_disabled" };

  const dispatch = await loadClubOaDispatchContext(clubId);
  if (!dispatch.ok) return { status: "skipped", reason: "oa_not_configured" };

  const targets = await supabase.rpc("list_club_event_line_targets", {
    p_club_id: clubId,
    p_event_id: eventId,
  });
  if (targets.error) return { status: "failed", reason: "targets_unavailable" };

  const projection = (targets.data ?? {}) as EventTargets;
  // A draft or cancelled event must never be announced. The publish already
  // happened by the time this runs, so this only catches a projection that does
  // not say what the caller assumed.
  if (projection.event_status !== "published") return { status: "failed", reason: "event_not_published" };
  if (typeof projection.title !== "string" || typeof projection.starts_at !== "string") {
    return { status: "failed", reason: "targets_unavailable" };
  }

  const recipients = Array.from(
    new Set(
      (Array.isArray(projection.oa_user_ids) ? projection.oa_user_ids : [])
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  if (recipients.length === 0) return { status: "skipped", reason: "no_reachable_recipients" };

  const text = composeEventPushText({
    title: projection.title,
    location: typeof projection.location === "string" ? projection.location : null,
    startsAt: projection.starts_at,
  });
  const delivery = await deliverClubOaText("multicast", recipients, text, dispatch.context);

  const logged = await supabase.rpc("record_club_event_line_push", {
    p_club_id: clubId,
    p_event_id: eventId,
    p_recipient_count: recipients.length,
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
  });

  if (delivery.status === "failed") {
    return { status: "failed", reason: delivery.failureCode ?? "provider_error" };
  }
  if (logged.error) return { status: "failed", reason: "push_not_recorded" };
  return { status: "sent", recipientCount: delivery.deliveredRecipientCount };
}
