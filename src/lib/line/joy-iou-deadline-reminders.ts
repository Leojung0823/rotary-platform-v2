import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { trustedSiteUrl } from "@/lib/site-url";
import { sendLineOaMessage, type LineDeliveryResult } from "./messaging";
import { loadClubOaDispatchContext } from "./oa-dispatch";

type JoyIouReminderJob = {
  reminder_id: string;
  club_id: string;
  recipient_membership_id: string;
  recipient_app_account_id: string;
  oa_user_id: string;
  reminder_kind: "due_today" | "overdue";
  notification_date: string;
  actionable_count: number;
};

export type JoyIouReminderSummary = {
  status: "completed" | "failed";
  jobCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  unknownCount: number;
  quotaStoppedClubCount: number;
};

const emptySummary = (): JoyIouReminderSummary => ({
  status: "completed",
  jobCount: 0,
  sentCount: 0,
  failedCount: 0,
  skippedCount: 0,
  unknownCount: 0,
  quotaStoppedClubCount: 0,
});

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function readJob(value: unknown): JoyIouReminderJob | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const job = value as Record<string, unknown>;
  if (!isUuid(job.reminder_id) || !isUuid(job.club_id)
    || !isUuid(job.recipient_membership_id) || !isUuid(job.recipient_app_account_id)
    || typeof job.oa_user_id !== "string" || job.oa_user_id.length < 1 || job.oa_user_id.length > 128
    || (job.reminder_kind !== "due_today" && job.reminder_kind !== "overdue")
    || typeof job.notification_date !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/u.test(job.notification_date)
    || typeof job.actionable_count !== "number" || !Number.isInteger(job.actionable_count)
    || job.actionable_count < 1 || job.actionable_count > 100_000) return null;
  return job as JoyIouReminderJob;
}

export function composeJoyIouReminderText(
  kind: JoyIouReminderJob["reminder_kind"],
  actionableCount: number,
  clubId: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const amount = actionableCount === 1 ? "一筆" : String(actionableCount) + "筆";
  const message = kind === "due_today"
    ? "提醒：您有" + amount + "非金錢承諾今天到期，請登入平台查看並更新進度。"
    : "提醒：您有" + amount + "非金錢承諾已逾期，請登入平台查看並更新進度。";
  try {
    const site = trustedSiteUrl(environment);
    const path = "/joy?clubId=" + encodeURIComponent(clubId) + "&mode=member";
    const link = new URL(path, site);
    if (link.origin === site.origin) return message + "\n\n查看待辦：\n" + link.toString();
  } catch {
    // The reminder remains useful without a link if the site origin is
    // temporarily misconfigured. Never substitute an untrusted host.
  }
  return message;
}

function failedDelivery(failureCode: LineDeliveryResult["failureCode"] = "provider_error"): LineDeliveryResult {
  return {
    status: "failed",
    failureCode,
    batchCount: 1,
    sentBatchCount: 0,
    deliveredRecipientCount: 0,
  };
}

/**
 * The database resolves one generic reminder per member and kind each day.
 * This function sends only to that resolved follower, records every result, and
 * halts the current club after LINE rejects a request for quota/rate reasons.
 */
export async function pushJoyIouDeadlineReminders(
  supabase: SupabaseClient,
  asOf = new Date().toISOString(),
): Promise<JoyIouReminderSummary> {
  const summary = emptySummary();
  if (process.env.APP_ENV !== "staging") return summary;

  const killSwitch = process.env.DISABLE_JOY_WALL_V1;
  if (killSwitch !== undefined && killSwitch !== "true" && killSwitch !== "false") {
    return { ...summary, status: "failed" };
  }
  if (killSwitch === "true") return summary;

  const claimed = await supabase.rpc("run_joy_iou_deadline_reminder_scheduler", {
    p_as_of: asOf,
    p_limit: 500,
  });
  if (claimed.error || !Array.isArray(claimed.data)) {
    return { ...summary, status: "failed", failedCount: 1 };
  }

  summary.jobCount = claimed.data.length;
  const dispatchByClub = new Map<string, Awaited<ReturnType<typeof loadClubOaDispatchContext>>>();
  const quotaStoppedClubs = new Set<string>();

  for (const rawJob of claimed.data) {
    const job = readJob(rawJob);
    if (!job) {
      summary.failedCount += 1;
      continue;
    }
    if (quotaStoppedClubs.has(job.club_id)) continue;

    let dispatch = dispatchByClub.get(job.club_id);
    if (!dispatch) {
      dispatch = await loadClubOaDispatchContext(job.club_id);
      dispatchByClub.set(job.club_id, dispatch);
    }
    if (!dispatch.ok) {
      const skipped = await supabase.rpc("skip_joy_iou_deadline_reminder", {
        p_reminder_id: job.reminder_id,
        p_failure_code: "oa_not_configured",
      });
      if (skipped.error) summary.failedCount += 1;
      else summary.skippedCount += 1;
      continue;
    }
    if (!dispatch.context.followers.includes(job.oa_user_id)) {
      const skipped = await supabase.rpc("skip_joy_iou_deadline_reminder", {
        p_reminder_id: job.reminder_id,
        p_failure_code: "recipient_unavailable",
      });
      if (skipped.error) summary.failedCount += 1;
      else summary.skippedCount += 1;
      continue;
    }

    const text = composeJoyIouReminderText(
      job.reminder_kind,
      job.actionable_count,
      job.club_id,
    );
    let delivery: LineDeliveryResult;
    try {
      delivery = await sendLineOaMessage(
        "push",
        [job.oa_user_id],
        [{ type: "text", text }],
        { accessToken: dispatch.context.accessToken },
      );
    } catch {
      delivery = failedDelivery("provider_error");
    }

    const outcome = delivery.status === "failed" && delivery.failureCode === "provider_timeout"
      ? "unknown"
      : delivery.status;
    const recorded = await supabase.rpc("record_joy_iou_deadline_reminder_delivery", {
      p_reminder_id: job.reminder_id,
      p_delivery_status: outcome,
      p_payload_summary: {
        message_type: "text",
        character_count: text.length,
        batch_count: delivery.batchCount,
        sent_batch_count: delivery.sentBatchCount,
        delivered_recipient_count: delivery.deliveredRecipientCount,
        outcome_unknown: outcome === "unknown",
      },
      p_provider_request_id: delivery.requestId ?? null,
      p_failure_code: delivery.status === "failed" ? (delivery.failureCode ?? "provider_error") : null,
    });

    if (recorded.error) {
      summary.failedCount += 1;
    } else if (outcome === "unknown") {
      summary.unknownCount += 1;
    } else if (delivery.status === "failed") {
      summary.failedCount += 1;
    } else {
      summary.sentCount += 1;
    }

    if (delivery.status === "failed" && delivery.failureCode === "rate_limited") {
      quotaStoppedClubs.add(job.club_id);
      const halted = await supabase.rpc("halt_joy_iou_deadline_reminders_for_club", {
        p_club_id: job.club_id,
        p_as_of: asOf,
      });
      if (halted.error) summary.failedCount += 1;
      else summary.quotaStoppedClubCount += 1;
    }
  }

  return summary;
}
