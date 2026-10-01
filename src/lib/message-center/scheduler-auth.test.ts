import { afterEach, describe, expect, it } from "vitest";
import { hasValidMessageCenterSchedulerSecret } from "./scheduler-auth";

describe("message centre scheduler authentication", () => {
  const original = process.env.MESSAGE_CENTER_SCHEDULER_SECRET;
  const secret = "message-center-scheduler-secret-0123456789";

  afterEach(() => {
    if (original === undefined) delete process.env.MESSAGE_CENTER_SCHEDULER_SECRET;
    else process.env.MESSAGE_CENTER_SCHEDULER_SECRET = original;
  });

  it("requires the exact bearer secret and rejects missing, short, or malformed values", () => {
    delete process.env.MESSAGE_CENTER_SCHEDULER_SECRET;
    expect(hasValidMessageCenterSchedulerSecret(`Bearer ${secret}`)).toBe(false);
    process.env.MESSAGE_CENTER_SCHEDULER_SECRET = "too-short";
    expect(hasValidMessageCenterSchedulerSecret("Bearer too-short")).toBe(false);
    process.env.MESSAGE_CENTER_SCHEDULER_SECRET = secret;
    expect(hasValidMessageCenterSchedulerSecret(null)).toBe(false);
    expect(hasValidMessageCenterSchedulerSecret(secret)).toBe(false);
    expect(hasValidMessageCenterSchedulerSecret(`Bearer ${secret}x`)).toBe(false);
    expect(hasValidMessageCenterSchedulerSecret(`Bearer ${secret}`)).toBe(true);
  });
});
