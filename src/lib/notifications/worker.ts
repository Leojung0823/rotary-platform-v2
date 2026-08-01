import type { NotificationProvider } from "./provider";
import { generalizedDeliveryError } from "./redaction";
import type { DeliveryClaim, ScheduledAnnouncementClaim, WorkerCounts } from "./types";

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
export const MAX_ANNOUNCEMENT_BATCH = 50;
export const MAX_NOTIFICATION_BATCH = 100;

type RpcResult = { data: unknown; error: { message?: string } | null };
export type WorkerRpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<RpcResult> };

export function assertLocalWorkerEnvironment(urlValue: string | undefined, appEnvironment: string | undefined) {
  if (!urlValue) throw new Error("local_worker_configuration_missing");
  let url: URL;
  try { url = new URL(urlValue); } catch { throw new Error("local_worker_url_invalid"); }
  if (appEnvironment === "production" || !localHosts.has(url.hostname)) {
    throw new Error("local_worker_remote_refused");
  }
  return url.toString();
}

export function boundedBatch(value: number, maximum: number) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error("worker_batch_invalid");
  return value;
}

function emptyCounts(): WorkerCounts {
  return { claimed: 0, completed: 0, retrying: 0, failed: 0, expired: 0 };
}

function rpcError(result: RpcResult, operation: string) {
  if (result.error) throw new Error(`${operation}_failed`);
  return result.data;
}

export async function runAnnouncementBatch(
  client: WorkerRpcClient,
  workerId: string,
  batchSize = 20,
) {
  boundedBatch(batchSize, MAX_ANNOUNCEMENT_BATCH);
  const counts = emptyCounts();
  const expiry = await client.rpc("expire_due_announcements", { p_limit: batchSize });
  counts.expired = Number(rpcError(expiry, "expire_announcements") ?? 0);
  const claimResult = await client.rpc("claim_due_scheduled_announcements", {
    p_limit: batchSize,
    p_worker_id: workerId,
  });
  const claims = (rpcError(claimResult, "claim_announcements") ?? []) as ScheduledAnnouncementClaim[];
  counts.claimed = claims.length;
  for (const claim of claims) {
    const completed = await client.rpc("complete_scheduled_announcement_claim", {
      p_announcement_id: claim.announcement_id,
      p_claim_token: claim.claim_token,
    });
    if (completed.error) {
      const failed = await client.rpc("fail_scheduled_announcement_claim", {
        p_announcement_id: claim.announcement_id,
        p_claim_token: claim.claim_token,
        p_error_code: "worker_temporary",
      });
      const status = rpcError(failed, "fail_announcement_claim");
      if (status === "retry_wait") counts.retrying += 1;
      else counts.failed += 1;
    } else {
      counts.completed += 1;
    }
  }
  return counts;
}

export async function runNotificationBatch(
  client: WorkerRpcClient,
  provider: NotificationProvider,
  workerId: string,
  batchSize = 50,
) {
  boundedBatch(batchSize, MAX_NOTIFICATION_BATCH);
  const counts = emptyCounts();
  const claimResult = await client.rpc("claim_notification_deliveries", {
    p_limit: batchSize,
    p_worker_id: workerId,
  });
  const claims = (rpcError(claimResult, "claim_deliveries") ?? []) as DeliveryClaim[];
  counts.claimed = claims.length;
  for (const claim of claims) {
    const outcome = await provider.deliver(claim);
    if (outcome.status === "sent") {
      const completed = await client.rpc("complete_notification_delivery", {
        p_delivery_id: claim.delivery_id,
        p_claim_token: claim.claim_token,
        p_provider_message_reference: outcome.messageReference,
      });
      rpcError(completed, "complete_delivery");
      counts.completed += 1;
      continue;
    }
    const failed = await client.rpc("fail_notification_delivery", {
      p_delivery_id: claim.delivery_id,
      p_claim_token: claim.claim_token,
      p_error_code: generalizedDeliveryError(outcome.errorCode),
    });
    const status = rpcError(failed, "fail_delivery");
    if (status === "retry_wait") counts.retrying += 1;
    else counts.failed += 1;
  }
  return counts;
}
