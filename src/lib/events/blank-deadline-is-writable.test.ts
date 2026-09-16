import { describe, expect, it } from "vitest";
import { definedFunctionNames, latestDefinition } from "@/lib/attendance/latest-definition";

/** Every function whose current definition takes a registration deadline in. */
function writersOfADeadline(): readonly string[] {
  return definedFunctionNames().filter((name) => {
    let body = "";
    try { body = latestDefinition(name); } catch { return false; }
    return body.includes("p_registration_deadline");
  });
}

describe("報名截止留空，要真的存得進去", () => {
  // #172 made the column nullable, collapsed 「還能不能報名」 into one shared
  // rule, taught every reader to handle a blank, and relabelled the field
  // 「選填」. It did not touch the writers: create_club_event and
  // update_club_event both still carried `or p_registration_deadline is null`
  // in their reject lists, so an officer who left it blank -- exactly as the
  // label invited -- got 「輸入資料不正確」.
  //
  // Every layer was green. Every e2e that touches this field fills it in, so
  // the blank path had never once been walked.

  it("has writers to check at all", () => {
    expect(writersOfADeadline().length, "no writers found; this guard is checking nothing")
      .toBeGreaterThan(1);
  });

  it("lets every one of them accept a blank", () => {
    const rejecting = writersOfADeadline().filter((name) =>
      /or\s+p_registration_deadline\s+is\s+null/u.test(latestDefinition(name)));
    expect(rejecting, "a writer refuses the blank the form offers").toEqual([]);
  });

  it("still refuses a deadline that is after the event starts", () => {
    // Not "stop validating". A deadline later than the start was always wrong
    // and still is; what changed is that absent is no longer the same as wrong.
    for (const name of ["create_club_event", "update_club_event"]) {
      expect(latestDefinition(name), `${name} stopped bounding the deadline`)
        .toMatch(/p_registration_deadline is not null[\s\S]{0,200}p_registration_deadline > p_starts_at/u);
    }
  });

  it("guards the bound explicitly rather than leaning on NULL propagation", () => {
    // `null <= now()` is NULL, and NULL in a long or-chain never fires the
    // raise -- so simply deleting the is-null clause would have worked, by
    // accident, in a way the next reader could not verify.
    for (const name of ["create_club_event", "update_club_event"]) {
      expect(latestDefinition(name)).toContain("p_registration_deadline is not null");
    }
  });

  it("makes publishing ask the shared rule", () => {
    const publish = latestDefinition("publish_club_event");
    expect(publish).toContain("public.event_registration_is_open(");
    expect(publish, "publishing still compares the deadline itself")
      .not.toMatch(/registration_deadline\s*<=\s*now\(\)/u);
  });
});
