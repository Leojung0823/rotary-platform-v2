import { describe, expect, it } from "vitest";
import { birthdayCollectionGenerationSuccessCode } from "./notification-result";

describe("birthday collection notification result", () => {
  it("reports sent and no-recipient batches as generated", () => {
    expect(birthdayCollectionGenerationSuccessCode({ status: "sent" })).toBe("generated");
    expect(birthdayCollectionGenerationSuccessCode({ status: "no_recipients" })).toBe("generated");
  });

  it("keeps a skipped notification visible to the manager", () => {
    expect(birthdayCollectionGenerationSuccessCode({ status: "skipped" }))
      .toBe("generated_notification_skipped");
  });

  it("fails closed for failed or malformed results", () => {
    expect(birthdayCollectionGenerationSuccessCode({ status: "failed" })).toBeNull();
    expect(birthdayCollectionGenerationSuccessCode({ status: "future_status" })).toBeNull();
    expect(birthdayCollectionGenerationSuccessCode(null)).toBeNull();
  });
});
