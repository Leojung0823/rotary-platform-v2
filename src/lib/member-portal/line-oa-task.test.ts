import { describe, expect, it } from "vitest";
import { parseLineOaOnboardingStatus } from "@/lib/line/oa-onboarding";
import { lineOaTaskFrom } from "./from-projection";

const clubId = "a1000000-0000-4000-8000-000000000001";

function status(overrides: Record<string, unknown> = {}) {
  const parsed = parseLineOaOnboardingStatus({
    club_id: clubId,
    club_name: "測試扶輪社",
    oa_available: true,
    join_url: "https://line.me/R/ti/p/%40rotary-test",
    friend_status: "unknown",
    pair_status: "unpaired",
    line_login_bound: true,
    dismissal_count: 0,
    next_prompt_after: null,
    ...overrides,
  });
  if (!parsed) throw new Error("fixture status must parse");
  return parsed;
}

describe("LINE OA home task", () => {
  it("shows a join task when the member has not followed", () => {
    expect(lineOaTaskFrom(status())).toMatchObject({
      title: "加入本社 LINE OA",
      detail: "加入後可接收本社重要通知",
      href: "/me/line-oa",
    });
  });

  it("asks an unbound member to bind before following", () => {
    expect(lineOaTaskFrom(status({ line_login_bound: false }))).toMatchObject({
      title: "先綁定 LINE 身份",
      href: "/me/line-oa",
    });
  });

  it("distinguishes an unfollowed account and a follower awaiting pairing", () => {
    expect(lineOaTaskFrom(status({ friend_status: "unfollowed" }))).toMatchObject({
      title: "重新加入本社 LINE OA",
    });
    expect(lineOaTaskFrom(status({ friend_status: "following", pair_status: "unpaired" }))).toMatchObject({
      title: "LINE OA 待完成配對",
    });
  });

  it("keeps conflicts visible and hides unavailable or completed accounts", () => {
    expect(lineOaTaskFrom(status({ pair_status: "conflict" }))).toMatchObject({
      title: "LINE 身份待確認",
    });
    expect(lineOaTaskFrom(status({ oa_available: false, join_url: null }))).toBeNull();
    expect(lineOaTaskFrom(status({ friend_status: "following", pair_status: "paired" }))).toBeNull();
  });
});
