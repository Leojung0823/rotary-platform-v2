import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateFeatureFlag, parseFeatureFlagRecord, resolveRuntimeAppEnvironment } from "@/lib/product/feature-flags";
import { composeMessagePushText } from "./message-center-push";
import { deliverClubOaText, loadClubOaDispatchContext } from "./oa-dispatch";

type BirthdayPushJob = {
  club_id?: unknown;
  message_id?: unknown;
  title?: unknown;
  body?: unknown;
  oa_user_ids?: unknown;
};

type ReadBirthdayPushJob = {
  club_id: string;
  message_id: string;
  title: string;
  body: string;
  oa_user_ids: string[];
};

export type BirthdayCollectionPushSummary = {
  status: "sent" | "skipped" | "failed";
  jobCount: number;
  sentCount: number;
  failedCount: number;
};

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function readJob(value: unknown): ReadBirthdayPushJob | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const job = value as BirthdayPushJob;
  if (!isUuid(job.club_id) || !isUuid(job.message_id)
    || typeof job.title !== "string" || typeof job.body !== "string") return null;
  const recipients = Array.isArray(job.oa_user_ids)
    ? Array.from(new Set(job.oa_user_ids.filter((id): id is string => typeof id === "string" && id.length > 0)))
    : [];
  return {
    club_id: job.club_id,
    message_id: job.message_id,
    title: job.title,
    body: job.body,
    oa_user_ids: recipients,
  };
}

async function linePushEnabled(supabase: SupabaseClient) {
  const flag = await supabase
    .from("platform_feature_flags")
    .select("feature_key, enabled, enabled_environments, rollout_percentage")
    .eq("feature_key", "line_oa_event_push_v1")
    .maybeSingle();
  if (flag.error) return false;

  return evaluateFeatureFlag({
    key: "line_oa_event_push_v1",
    record: flag.data
      ? parseFeatureFlagRecord({
        enabled: flag.data.enabled,
        enabledEnvironments: flag.data.enabled_environments,
        rolloutPercentage: flag.data.rollout_percentage,
      })
      : null,
    environment: resolveRuntimeAppEnvironment(process.env),
    env: process.env,
  }).enabled;
}

/**
 * Delivers the messages created by the protected birthday scheduler. The
 * projection and log RPC are service-role-only because there is no signed-in
 * member session when a scheduled job runs. A failed LINE push never makes the
 * already-created in-app task disappear or turns the scheduler into a retry
 * storm; the per-message log remains the idempotency boundary.
 */
export async function pushBirthdayCollectionNotifications(
  supabase: SupabaseClient,
): Promise<BirthdayCollectionPushSummary> {
  if (!(await linePushEnabled(supabase))) {
    return { status: "skipped", jobCount: 0, sentCount: 0, failedCount: 0 };
  }

  const jobsResult = await supabase.rpc("list_birthday_collection_line_push_jobs");
  if (jobsResult.error || !Array.isArray(jobsResult.data)) {
    return { status: "failed", jobCount: 0, sentCount: 0, failedCount: 1 };
  }

  let sentCount = 0;
  let failedCount = 0;
  for (const rawJob of jobsResult.data) {
    const job = readJob(rawJob);
    if (!job) {
      failedCount += 1;
      continue;
    }
    if (job.oa_user_ids.length === 0) continue;

    const dispatch = await loadClubOaDispatchContext(job.club_id);
    if (!dispatch.ok) {
      failedCount += 1;
      continue;
    }

    const text = composeMessagePushText(job.title, job.body);
    const delivery = await deliverClubOaText(
      "multicast",
      job.oa_user_ids,
      text,
      dispatch.context,
    );
    const logged = await supabase.rpc("record_birthday_collection_line_push", {
      p_club_id: job.club_id,
      p_message_id: job.message_id,
      p_recipient_count: job.oa_user_ids.length,
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

    if (delivery.status === "failed" || logged.error) failedCount += 1;
    else sentCount += 1;
  }

  return {
    status: failedCount > 0 ? "failed" : "sent",
    jobCount: jobsResult.data.length,
    sentCount,
    failedCount,
  };
}
