import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const list = latestDefinition("list_club_members");
const page = readFileSync("src/app/(authenticated)/clubs/[clubId]/members/page.tsx", "utf8");

describe("「已加入但沒配對」不是「未加入」", () => {
  // The list joins a follower row on person_id, so a member who added the OA
  // and has not been linked to a membership yet has no row to find. Every one
  // of them read as 未加入, and the club went off asking people to add an OA
  // they had already added. Leo hit exactly this.
  it("has a state of its own", () => {
    expect(list).toContain("'awaiting_pairing'");
    expect(list).toContain("'unpaired'");
  });

  it("recognises it the same way auto-pairing does", () => {
    // provider_subject is the stable LINE user ID shared by channels under the
    // same provider -- the value auto_pair_line_oa_follower matches on. Using
    // anything else here would mean the list and the pairing disagree.
    const branch = list.slice(list.indexOf("when exists ("), list.indexOf("then 'awaiting_pairing'"));
    expect(branch).toContain("waiting.oa_user_id = identity.provider_subject");
    expect(branch).toContain("waiting.person_id is null");
    expect(branch).toContain("waiting.follower_status = 'following'");
    expect(branch).toContain("waiting.club_id = membership.club_id");
  });

  it("matches on nothing but that id", () => {
    const branch = list.slice(list.indexOf("when exists ("), list.indexOf("then 'awaiting_pairing'"));
    for (const guess of ["canonical_name", "primary_email", "primary_phone", "avatar"]) {
      expect(branch, `pairing state guessed from ${guess}`).not.toContain(guess);
    }
  });

  it("still prefers a real pairing when there is one", () => {
    const expression = list.slice(list.indexOf("case\n      when follower.id is not null"), list.indexOf("end,\n    membership.created_at"));
    expect(expression.indexOf("follower.follower_status"))
      .toBeLessThan(expression.indexOf("awaiting_pairing"));
  });

  it("keeps the signature so every caller still matches", () => {
    // A new column would need DROP + CREATE and would break every verification
    // file that names the full signature. This adds a value, not a column.
    expect(list).toContain("p_club_id uuid, p_query text default null, p_status text default null");
    expect(list).not.toContain("drop function");
  });
});

describe("the page says which of the three it is", () => {
  it("names all three states", () => {
    expect(page).toContain('awaiting_pairing: "已加入，待配對"');
    expect(page).toContain('following: "已加入"');
    expect(page).toContain('unpaired: "未加入"');
  });

  it("reads the state rather than the presence of a row", () => {
    // `oa_follower_id ? "已加入" : "未加入"` is the two-state reading that
    // caused this; the row is absent in both of the states being told apart.
    expect(page).not.toContain('member.oa_follower_id ? "已加入" : "未加入"');
    expect(page).toContain("oaLabels[member.oa_status]");
  });

  it("offers the one click that fixes it", () => {
    const cell = page.slice(page.indexOf("oaTone(member.oa_status)"), page.indexOf("oaTone(member.oa_status)") + 400);
    expect(cell).toContain('awaiting_pairing');
    expect(cell).toContain("/line-oa?mode=management");
  });

  it("does not colour an unfinished pairing as done", () => {
    expect(page).toContain('if (status === "following") return "success"');
    expect(page).toContain('if (status === "awaiting_pairing") return "warning"');
  });
});
