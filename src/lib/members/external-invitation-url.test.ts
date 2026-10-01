import { describe, expect, it } from "vitest";
import { externalMemberInvitationUrl } from "./external-invitation-url";

describe("external member invitation URLs", () => {
  it("adds the LINE external-browser hint to per-member invitation links", () => {
    expect(externalMemberInvitationUrl("https://members.example.com", "/join", "a/b+c"))
      .toBe("https://members.example.com/join?token=a%2Fb%2Bc&openExternalBrowser=1");
  });

  it("adds the same hint to public club join links", () => {
    expect(externalMemberInvitationUrl("https://members.example.com/", "/join-club", "join-token"))
      .toBe("https://members.example.com/join-club?token=join-token&openExternalBrowser=1");
  });
});
