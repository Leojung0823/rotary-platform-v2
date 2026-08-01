import type { ProviderDeliveryRequest, ProviderDeliveryResult, ProviderMode } from "./types";

export interface NotificationProvider {
  readonly mode: ProviderMode;
  deliver(request: ProviderDeliveryRequest): Promise<ProviderDeliveryResult>;
}
