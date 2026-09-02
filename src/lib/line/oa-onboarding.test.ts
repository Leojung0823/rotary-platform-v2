import { describe, expect, it } from "vitest";
import {
  lineOaHomePrompt,
  parseLineOaOnboardingStatus,
} from "./oa-onboarding";

const clubId = "a1000000-0000-4000-8000-000000000001";

function projection(overrides: Record<string, unknown> = {}) {
  return {
    club_id: clubId,
    club_name: "測試扶輪社",
    oa_available: true,
    join_url: "https://line.me/R/ti/p/%40rotary-test",
    friend_status: "unknown",
    pair_status: "unpaired",
    line_login_bound: false,
    dismissal_count: 0,
    next_prompt_after: null,
    ...overrides,
  };
}

describe("LINE OA onboarding projection", () => {
  it("parses the bounded caller-only shape", () => {
    expect(parseLineOaOnboardingStatus(projection())).toMatchObject({
      clubId,
      clubName: "測試扶輪社",
      pairStatus: "unpaired",
    });
  });

  it("rejects leaked fields and non-LINE redirect destinations", () => {
    expect(parseLineOaOnboardingStatus(projection({ oa_user_id: "U-secret" }))).toBeNull();
    expect(parseLineOaOnboardingStatus(projection({ join_url: "https://evil.example/oa" }))).toBeNull();
    expect(parseLineOaOnboardingStatus(projection({ join_url: "https://line.me/R/ti/p/%40ok?token=secret" }))).toBeNull();
  });

  it("requires unavailable OA projections to withhold their join URL", () => {
    expect(parseLineOaOnboardingStatus(projection({ oa_available: false }))).toBeNull();
    expect(parseLineOaOnboardingStatus(projection({ oa_available: false, join_url: null }))).not.toBeNull();
  });

  it("does not accept an impossible paired-but-not-following state", () => {
    expect(parseLineOaOnboardingStatus(projection({ pair_status: "paired" }))).toBeNull();
    expect(parseLineOaOnboardingStatus(projection({ pair_status: "paired", friend_status: "following" }))).not.toBeNull();
  });
});

describe("LINE OA reminder cadence", () => {
  const now = new Date("2026-09-03T12:00:00.000Z");
  const parsed = parseLineOaOnboardingStatus(projection());
  if (!parsed) throw new Error("fixture projection must parse");

  it("starts with the prominent first-run prompt", () => {
    expect(lineOaHomePrompt(parsed, now)).toBe("full");
  });

  it("respects the 7-day and 30-day cross-device cooling periods", () => {
    expect(lineOaHomePrompt({ ...parsed, dismissalCount: 1, nextPromptAfter: "2026-09-04T12:00:00.000Z" }, now)).toBe("hidden");
    expect(lineOaHomePrompt({ ...parsed, dismissalCount: 1, nextPromptAfter: "2026-09-02T12:00:00.000Z" }, now)).toBe("banner");
    expect(lineOaHomePrompt({ ...parsed, dismissalCount: 2, nextPromptAfter: "2026-09-02T12:00:00.000Z" }, now)).toBe("quiet");
  });

  it("stops interrupting after the third dismissal or after pairing", () => {
    expect(lineOaHomePrompt({ ...parsed, dismissalCount: 3 }, now)).toBe("hidden");
    expect(lineOaHomePrompt({ ...parsed, friendStatus: "following", pairStatus: "paired" }, now)).toBe("hidden");
  });
});
