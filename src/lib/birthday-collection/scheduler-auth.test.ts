import { afterEach, describe, expect, it, vi } from "vitest";
import { hasValidBirthdayCollectionSchedulerSecret } from "./scheduler-auth";

describe("birthday collection scheduler authentication", () => {
  const configuredSecret = "scheduler-secret-0123456789-abcdef-0123456789";

  afterEach(() => vi.unstubAllEnvs());

  it("accepts only the configured bearer secret", () => {
    vi.stubEnv("BIRTHDAY_COLLECTION_SCHEDULER_SECRET", configuredSecret);
    expect(hasValidBirthdayCollectionSchedulerSecret(`Bearer ${configuredSecret}`)).toBe(true);
    expect(hasValidBirthdayCollectionSchedulerSecret(configuredSecret)).toBe(false);
    expect(hasValidBirthdayCollectionSchedulerSecret(`Bearer ${configuredSecret} `)).toBe(false);
  });

  it("fails closed when the secret is absent or different", () => {
    vi.stubEnv("BIRTHDAY_COLLECTION_SCHEDULER_SECRET", configuredSecret);
    expect(hasValidBirthdayCollectionSchedulerSecret(null)).toBe(false);
    expect(hasValidBirthdayCollectionSchedulerSecret("Bearer other-secret")).toBe(false);
    vi.stubEnv("BIRTHDAY_COLLECTION_SCHEDULER_SECRET", "too-short");
    expect(hasValidBirthdayCollectionSchedulerSecret(`Bearer ${configuredSecret}`)).toBe(false);
    vi.stubEnv("BIRTHDAY_COLLECTION_SCHEDULER_SECRET", "");
    expect(hasValidBirthdayCollectionSchedulerSecret(`Bearer ${configuredSecret}`)).toBe(false);
  });
});
