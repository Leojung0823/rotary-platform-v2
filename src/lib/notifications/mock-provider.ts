import { createHash } from "node:crypto";
import type { NotificationProvider } from "./provider";
import type { ProviderDeliveryRequest, ProviderDeliveryResult } from "./types";

export type MockProviderBehavior = "success" | "temporary_failure" | "permanent_failure";

export class MockNotificationProvider implements NotificationProvider {
  readonly mode = "mock" as const;
  private readonly behavior: MockProviderBehavior;

  constructor(behavior: MockProviderBehavior = "success") {
    this.behavior = behavior;
  }

  async deliver(request: ProviderDeliveryRequest): Promise<ProviderDeliveryResult> {
    if (this.behavior === "temporary_failure") {
      return { status: "temporary_failure", errorCode: "provider_temporary" };
    }
    if (this.behavior === "permanent_failure") {
      return { status: "permanent_failure", errorCode: "provider_permanent" };
    }
    const digest = createHash("sha256").update(request.idempotency_key).digest("hex").slice(0, 24);
    return { status: "sent", messageReference: `mock-${digest}` };
  }
}
