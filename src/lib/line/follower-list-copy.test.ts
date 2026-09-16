import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(authenticated)/clubs/[clubId]/line-oa/page.tsx", "utf8")
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/gu, "");

function followerSection(): string {
  const start = page.indexOf("<h2>Follower 配對</h2>");
  expect(start, "the follower section is gone").toBeGreaterThan(-1);
  return page.slice(start, page.indexOf("<h2>推播紀錄</h2>", start));
}

describe("the follower list says what it does not know", () => {
  // It reads as the truth about who joined, and it is not: it is built from
  // follow events, so it only knows about people who joined while the webhook
  // was already receiving them, and LINE does not resend. Leo spent a while
  // looking here for two members who had simply never finished joining, with
  // no way to tell that from a follow the platform had missed.
  it("says where the list comes from", () => {
    expect(followerSection()).toContain("webhook 收到的 follow 事件");
  });

  it("says LINE does not backfill", () => {
    expect(followerSection()).toContain("LINE 不會補送");
  });

  it("names the number to compare it against", () => {
    // The one check that settles it, and the one that settled it this time.
    expect(followerSection()).toContain("分析 → 好友");
  });

  it("counts what the platform knows, not what LINE has", () => {
    expect(followerSection()).toContain("平台已知");
  });

  it("no longer implies the list is complete", () => {
    // 「加入官方帳號的人會自動出現在這裡」 reads as a guarantee.
    expect(followerSection()).not.toContain("加入官方帳號的人會自動出現在這裡");
  });

  it("still explains the pairing control beside it", () => {
    expect(followerSection()).toContain("未配對的列可以直接選社員完成配對");
  });
});
