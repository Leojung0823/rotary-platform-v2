import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MAX_DELIVERY_ATTEMPTS, retryBackoffSeconds, shouldRetry } from "./backoff";
import { DisabledNotificationProvider } from "./disabled-provider";
import { deduplicateEligibleAccounts, emailDeliveryEligible, lineDeliveryEligible } from "./eligibility";
import { MockNotificationProvider } from "./mock-provider";
import { generalizedDeliveryError, redactAuditMetadata, safeWorkerLog } from "./redaction";
import { assertLocalWorkerEnvironment, boundedBatch, runNotificationBatch } from "./worker";

const request = {
  delivery_id: "00000000-0000-0000-0000-000000000001",
  channel: "email" as const,
  idempotency_key: "delivery:00000000-0000-0000-0000-000000000001",
  attempt_count: 1,
};

describe("notification providers and policy", () => {
  it("returns the same generalized mock reference for an idempotency key", async () => {
    const provider = new MockNotificationProvider();
    const first = await provider.deliver(request);
    const second = await provider.deliver(request);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain(request.delivery_id);
  });

  it("supports deterministic temporary and permanent mock failures", async () => {
    await expect(new MockNotificationProvider("temporary_failure").deliver(request))
      .resolves.toEqual({ status: "temporary_failure", errorCode: "provider_temporary" });
    await expect(new MockNotificationProvider("permanent_failure").deliver(request))
      .resolves.toEqual({ status: "permanent_failure", errorCode: "provider_permanent" });
  });

  it("keeps disabled delivery unsent and explicitly non-retryable", async () => {
    await expect(new DisabledNotificationProvider().deliver(request)).resolves.toEqual({
      status: "disabled", errorCode: "disabled", retryable: false,
    });
  });

  it("requires every channel eligibility condition", () => {
    const base = { preferenceEnabled: true, accountActive: true, membershipActive: true, clubActive: true, providerMode: "mock" as const };
    expect(emailDeliveryEligible({ ...base, trustedEmailPresent: true })).toBe(true);
    expect(emailDeliveryEligible({ ...base, trustedEmailPresent: false })).toBe(false);
    expect(lineDeliveryEligible({ ...base, pairedOaFollowerFollowing: true })).toBe(true);
    expect(lineDeliveryEligible({ ...base, pairedOaFollowerFollowing: false })).toBe(false);
  });

  it("deduplicates accounts hit by overlapping audiences", () => {
    expect(deduplicateEligibleAccounts(["a", "a", "b"])).toEqual(["a", "b"]);
  });

  it("uses bounded exponential backoff and three attempts by default", () => {
    expect(DEFAULT_MAX_DELIVERY_ATTEMPTS).toBe(3);
    expect([1, 2, 3, 9].map(retryBackoffSeconds)).toEqual([30, 60, 120, 3_600]);
    expect(shouldRetry(2)).toBe(true);
    expect(shouldRetry(3)).toBe(false);
  });

  it("redacts errors, audit metadata, and logs", () => {
    expect(generalizedDeliveryError("recipient@example.test")).toBe("provider_permanent");
    expect(redactAuditMetadata({ body: "private", account_id: "private", delivery_count: 2 })).toEqual({ delivery_count: 2 });
    expect(safeWorkerLog({ claimed: 2, completed: 1 })).toBe('{"claimed":2,"completed":1}');
  });
});

describe("bounded local worker", () => {
  it("accepts local URLs and permanently refuses production or remote URLs", () => {
    expect(assertLocalWorkerEnvironment("http://127.0.0.1:54321", "local")).toContain("127.0.0.1");
    expect(() => assertLocalWorkerEnvironment("https://example.supabase.co", "local")).toThrow("remote_refused");
    expect(() => assertLocalWorkerEnvironment("http://localhost:54321", "production")).toThrow("remote_refused");
  });

  it("rejects unbounded batch sizes", () => {
    expect(boundedBatch(100, 100)).toBe(100);
    expect(() => boundedBatch(101, 100)).toThrow("batch_invalid");
  });

  it("claims once and completes mock delivery without logging content", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_notification_deliveries") return { data: [{ ...request, notification_id: "n", claim_token: "claim", max_attempts: 3, lease_expires_at: new Date().toISOString() }], error: null };
      return { data: null, error: null };
    });
    const result = await runNotificationBatch({ rpc }, new MockNotificationProvider(), "worker-1", 1);
    expect(result).toMatchObject({ claimed: 1, completed: 1, failed: 0 });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
