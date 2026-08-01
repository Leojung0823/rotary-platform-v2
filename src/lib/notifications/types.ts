export type NotificationChannel = "email" | "line";
export type ProviderMode = "mock" | "disabled";

export type DeliveryClaim = {
  delivery_id: string;
  notification_id: string;
  channel: NotificationChannel;
  claim_token: string;
  idempotency_key: string;
  attempt_count: number;
  max_attempts: number;
  lease_expires_at: string;
};

export type ScheduledAnnouncementClaim = {
  announcement_id: string;
  club_id: string;
  claim_token: string;
  attempt_count: number;
  lease_expires_at: string;
};

export type ProviderDeliveryRequest = Pick<
  DeliveryClaim,
  "delivery_id" | "channel" | "idempotency_key" | "attempt_count"
>;

export type ProviderDeliveryResult =
  | { status: "sent"; messageReference: string }
  | { status: "temporary_failure"; errorCode: "provider_temporary" }
  | { status: "permanent_failure"; errorCode: "provider_permanent" }
  | { status: "disabled"; errorCode: "disabled"; retryable: false };

export type WorkerCounts = {
  claimed: number;
  completed: number;
  retrying: number;
  failed: number;
  expired: number;
};
