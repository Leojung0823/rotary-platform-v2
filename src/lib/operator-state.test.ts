import { describe, expect, it } from "vitest";
import { canAcceptInvite, canClubOperatorRevoke } from "./operator-state";

describe("operator invitation transitions", () => {
  const now = new Date("2026-07-22T00:00:00Z");
  it("accepts only open, unexpired invitations", () => {
    expect(canAcceptInvite("sent", new Date("2026-07-23T00:00:00Z"), now)).toBe(true);
    expect(canAcceptInvite("accepted", new Date("2026-07-23T00:00:00Z"), now)).toBe(false);
    expect(canAcceptInvite("pending", new Date("2026-07-21T00:00:00Z"), now)).toBe(false);
  });
  it("protects the final operator of an active club", () => {
    expect(canClubOperatorRevoke(1, "active")).toBe(false);
    expect(canClubOperatorRevoke(2, "active")).toBe(true);
    expect(canClubOperatorRevoke(1, "provisioning")).toBe(true);
  });
});
