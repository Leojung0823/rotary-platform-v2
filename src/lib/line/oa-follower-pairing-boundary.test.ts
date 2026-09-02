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

describe("LINE OA account retirement", () => {
  const actions = readFileSync("src/app/actions.ts", "utf8");

  it("can reach the disabled state the database already supports", () => {
    // The configure form only ever sent "active", so an account saved against
    // the wrong club could never be retired from any screen.
    expect(actions).toContain("disableLineOaAction");
    expect(actions).toContain('p_mode: "disabled"');
    expect(page).toContain("action={disableLineOaAction}");
  });

  it("carries the stored display name, which the RPC refuses to be empty", () => {
    const block = actions.slice(
      actions.indexOf("export async function disableLineOaAction"),
      actions.indexOf("export async function pairLineOaAction"),
    );
    expect(block).toContain('formData.get("displayName")');
    expect(page).toContain('value={oa.account.display_name}');
  });

  it("only offers retirement once an account exists", () => {
    expect(page).toContain("{oa.account && <form action={disableLineOaAction}");
  });
});
