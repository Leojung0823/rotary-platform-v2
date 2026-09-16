import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const projection = latestDefinition("get_my_member_home_projection");
const profileGaps = (() => {
  const from = projection.indexOf("profile_gaps as (");
  expect(from, "profile_gaps is gone from the projection").toBeGreaterThan(-1);
  return projection.slice(from, projection.indexOf("), presented_events", from));
})();

/** The columns of public.people that update_my_profile actually writes. */
const writableFromMe = (() => {
  const body = latestDefinition("update_my_profile");
  const at = body.indexOf("update public.people");
  expect(at, "update_my_profile no longer writes public.people").toBeGreaterThan(-1);
  const statement = body.slice(at, body.indexOf(";", at));
  return new Set([...statement.matchAll(/(?:set|,)\s*(\w+)\s*=/gu)].map((match) => match[1]));
})();

describe("一個清不掉的提醒比沒有提醒更糟", () => {
  // 個人資料未完成 asked for a phone. /me states the rule on screen -- 手機與
  // Email 至少保留一項 -- and update_my_profile enforces exactly that. So a
  // member who keeps an email and no phone filled the form, was told they were
  // complete, and the reminder was still there the next day, with no action
  // available anywhere that would clear it.

  it("tests only columns the page it links to can write", () => {
    // This is what makes 「清得掉」 a checkable claim rather than a judgement:
    // every column the reminder reads has to be one /me can change.
    // The select list only: `person.id` in the join below is how the row is
    // found, not something the reminder asks the member to fill in.
    const tested = profileGaps.slice(profileGaps.indexOf("select"), profileGaps.indexOf("from my_person"));
    expect(tested, "profile_gaps no longer has a select list to read").toContain("person.");
    const read = [...tested.matchAll(/person\.(\w+)/gu)].map((match) => match[1]);
    expect(read.length, "no person columns found; this guard is checking nothing")
      .toBeGreaterThan(0);
    expect(writableFromMe.size, "no writable columns found; this guard is checking nothing")
      .toBeGreaterThan(0);
    const unclearable = [...new Set(read)].filter((column) => !writableFromMe.has(column));
    expect(unclearable, "the reminder reads a column /me cannot change").toEqual([]);
  });

  it("counts an email as a way to reach someone", () => {
    expect(profileGaps).toContain("primary_email");
    expect(profileGaps, "a phone on its own still decides whether anyone can be reached")
      .toMatch(/primary_phone[\s\S]*?\band\b[\s\S]*?primary_email/u);
  });

  it("says 聯絡方式 rather than 聯絡電話", () => {
    // The wording has to follow the rule, or the reminder names something the
    // member is not actually required to provide.
    expect(projection).toContain("缺聯絡方式");
    expect(projection).not.toContain("缺聯絡電話");
  });

  it("still reminds someone the club genuinely cannot reach", () => {
    // Not "delete the reminder". Someone with neither a phone nor an email is
    // exactly who this was for.
    expect(profileGaps).toContain("primary_phone");
    expect(projection).toContain("'kind', 'profile_incomplete'");
  });
});
