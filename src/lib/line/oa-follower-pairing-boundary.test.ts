import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(authenticated)/clubs/[clubId]/line-oa/page.tsx", "utf8");

describe("LINE OA follower pairing controls", () => {
  it("offers pairing on the rows that arrived unpaired", () => {
    // A follower created by a follow event has no person_id. Before this, the
    // only control on that row was "解除 OA 配對", which undoes a pairing that
    // was never made, and the officer had to copy the OA userId out of the LINE
    // console because the table truncates it.
    expect(page).toContain("follower.person_id");
    expect(page).toContain('<input type="hidden" name="oaUserId" value={follower.oa_user_id}/>');
    expect(page).toContain("action={pairLineOaAction}");
  });

  it("does not offer unpairing on a follower that is not paired", () => {
    const row = page.slice(page.indexOf('follower.status === "following" && (follower.person_id'));
    const unpairIndex = row.indexOf("unpairLineOaAction");
    const pairIndex = row.indexOf("pairLineOaAction");
    // The paired branch comes first, the unpaired branch second; both exist.
    expect(unpairIndex).toBeGreaterThan(-1);
    expect(pairIndex).toBeGreaterThan(unpairIndex);
  });

  it("still truncates the identifier it shows, and only widens what it submits", () => {
    expect(page).toContain("follower.oa_user_id.slice(0, 10)");
  });
});
