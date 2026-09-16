import { describe, expect, it } from "vitest";
import { definedFunctionNames, latestDefinition } from "@/lib/attendance/latest-definition";

const projection = latestDefinition("get_my_member_home_projection");
const duesBranch = (() => {
  const from = projection.indexOf("dues_outstanding as (");
  expect(from, "the dues branch is gone").toBeGreaterThan(-1);
  return projection.slice(from, projection.indexOf("), birthday_wishes_to_write", from));
})();

describe("提醒說得出金額，就要送到看得到那筆金額的地方", () => {
  // The reminder deliberately spans every Rotary year -- dues left over from
  // last year are still owed. /dues shows one year at a time and opens on the
  // newest. So a member who owed from last year read 「社費未繳 · TWD 3000」,
  // tapped it, and saw this year, settled, with nothing to say where to look.

  it("carries the year the money is owed for", () => {
    expect(duesBranch).toContain("receivable.rotary_year_id");
    expect(duesBranch, "the year is taken from somewhere other than the receivable")
      .toMatch(/join public\.rotary_years/u);
  });

  it("links to that year rather than to whichever one opens by default", () => {
    expect(projection).toContain("concat('/dues?yearId=', dues.rotary_year_id::text)");
  });

  it("names the year, because owing two years gives two identical rows", () => {
    expect(duesBranch).toContain("year_label");
    expect(projection).toMatch(/'detail', concat_ws\(\s*'[^']*·[^']*',\s*dues\.year_label/u);
  });

  it("still spans every year rather than narrowing to the current one", () => {
    // The fix is where the reminder sends you, not what it counts. Limiting it
    // to this year would make last year's debt silently stop being mentioned.
    expect(duesBranch, "the reminder was narrowed to one Rotary year")
      .not.toMatch(/year_item\.start_year\s*=|current_rotary_year/u);
  });
});

describe("一條規則只准有一份定義，整個 schema 都算", () => {
  // #185 collapsed two copies of the birthday classification into
  // birthday_wish_action_status -- and left a third, in list_my_club_messages,
  // because that PR's guard only read get_my_member_home_projection. The guard
  // was narrower than the claim it was making, so the copy it did not read
  // stayed invisible.
  const classification = /when\s+[\w.]*submission_status\s+in\s*\('submitted',\s*'published'\)\s+then\s+'completed'/u;

  it("finds the rule defined exactly once", () => {
    const definers = definedFunctionNames().filter((name) => {
      let body = "";
      try { body = latestDefinition(name); } catch { return false; }
      return classification.test(body.replace(/--[^\n]*/gu, ""));
    });
    expect(definers, "the classification is written out in more than one place")
      .toEqual(["birthday_wish_action_status"]);
  });

  it("has every reader ask that one", () => {
    for (const name of ["get_my_member_home_projection", "list_my_club_messages"]) {
      expect(latestDefinition(name), `${name} does not ask the shared rule`)
        .toContain("public.birthday_wish_action_status(");
    }
  });

  it("scans more than one function, so it could have caught the third copy", () => {
    // The point of the failure being repaired: a guard that reads one function
    // cannot say anything about a schema.
    expect(definedFunctionNames().length).toBeGreaterThan(50);
  });
});
