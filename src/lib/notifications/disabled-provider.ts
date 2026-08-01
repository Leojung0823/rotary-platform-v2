import type { NotificationProvider } from "./provider";
import type { ProviderDeliveryRequest, ProviderDeliveryResult } from "./types";

export class DisabledNotificationProvider implements NotificationProvider {
  readonly mode = "disabled" as const;

  async deliver(request: ProviderDeliveryRequest): Promise<ProviderDeliveryResult> {
    void request;
    return { status: "disabled", errorCode: "disabled", retryable: false };
  }
}
