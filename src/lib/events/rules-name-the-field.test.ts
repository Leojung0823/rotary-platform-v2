import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";
import { EVENT_CREATE_FIELDS } from "./validation";

const memberEvents = readFileSync("src/app/(authenticated)/events/page.tsx", "utf8");

const actions = readFileSync("src/app/event-actions.ts", "utf8");
const create = latestDefinition("create_club_event");
const update = latestDefinition("update_club_event");

/** Every message create_club_event can refuse with. */
function refusals(body: string): string[] {
  return [...body.matchAll(/errcode = '22023', message = '(\w+)'/gu)].map((match) => match[1]);
}

describe("開始時間可以是過去", () => {
  // Creating an event required a future start, so recording a meeting that has
  // already begun -- or already happened -- was refused outright. update_club_event
  // never required it, so the two halves of one feature disagreed.

  it("no longer refuses a start that has passed", () => {
    expect(create, "creating an event still demands a future start")
      .not.toMatch(/p_starts_at\s*<=\s*now\(\)/u);
  });

  it("no longer refuses a deadline that has passed", () => {
    // It follows: once the start may be in the past, a closed registration is a
    // fact about the event, not a mistake in the form.
    expect(create).not.toMatch(/p_registration_deadline\s*<=\s*now\(\)/u);
  });

  it("agrees with editing, which never asked for a future start", () => {
    expect(update).not.toMatch(/p_starts_at\s*<=\s*now\(\)/u);
  });

  it("still refuses what is genuinely contradictory", () => {
    // Not "stop validating". An event that ends before it starts, or a deadline
    // after the start, is nonsense at any point on the timeline.
    expect(create).toMatch(/p_ends_at\s*<=\s*p_starts_at/u);
    expect(create).toMatch(/p_registration_deadline\s*>\s*p_starts_at/u);
    expect(create).toMatch(/p_capacity\s*<\s*1/u);
  });
});

describe("被擋下來的時候，要說得出是哪一欄", () => {
  // Ten rules shared one raise, so every one of them arrived as
  // invalid_event_input and the form could only say 「活動資料未通過系統規則，
  // 請確認內容後再試」 -- with a per-field error slot sitting unused right
  // beside the field that was actually wrong.

  it("gives each rule its own message", () => {
    const messages = refusals(create);
    expect(messages.length, "the rules are still sharing one raise").toBeGreaterThan(5);
    expect(new Set(messages).size, "two rules answer with the same message").toBe(messages.length);
  });

  it("names a real field for every message the database can send", () => {
    const handled = [...actions.matchAll(/\{ message: "(\w+)", field: "(\w+)"/gu)];
    expect(handled.length, "nothing maps a rule to a field").toBeGreaterThan(5);
    for (const [, , field] of handled) {
      expect(EVENT_CREATE_FIELDS, `${field} is not a field this form has`).toContain(field);
    }
    const mapped = new Set(handled.map(([, message]) => message));
    const unmapped = refusals(create).filter((message) => !mapped.has(message));
    expect(unmapped, "the database can refuse with a message the form cannot place").toEqual([]);
  });

  it("puts the named field ahead of the sentence that names none", () => {
    // The return, not the string: the comment above this block quotes the same
    // sentence, and the first version of this guard compared against that.
    const at = actions.indexOf("const named = eventRuleFailures.find");
    const fallback = actions.indexOf('return createEventFailure(values, revision, "活動資料未通過系統規則');
    expect(at, "the field lookup is gone").toBeGreaterThan(-1);
    expect(fallback, "the catch-all return is gone").toBeGreaterThan(-1);
    expect(at, "the catch-all answers first, so the field is never named").toBeLessThan(fallback);
  });

  it("keeps the catch-all for a message it has never seen", () => {
    // Removing it would turn an unknown refusal into silence.
    expect(actions).toContain("活動資料未通過系統規則");
  });
});

describe("不計入出席的活動也找得到簽到", () => {
  // #164 made check-in work for events that do not count towards attendance,
  // and the database agrees: check_in_to_event_by_location never asks about it.
  // The member-facing button still did, so an officer who unticked 計入出席 was
  // shown no way to check in at all -- which reads as 「找不到簽到的方法」.
  it("offers 本人簽到 without asking whether it counts", () => {
    // Anchored on the rendered link, not on the first 本人簽到 in the file:
    // two comments above this block quote the label, so indexOf lands inside a
    // comment and the condition read back from there belongs to something else.
    // That is the third guard in this session to be fooled by its own prose.
    const at = memberEvents.indexOf('href="/events/checkin">本人簽到');
    expect(at, "the member events page no longer offers 本人簽到").toBeGreaterThan(-1);
    const condition = memberEvents.slice(memberEvents.lastIndexOf("{event.status ===", at), at);
    expect(condition.length, "the link moved away from its condition").toBeLessThan(260);
    expect(condition, "the check-in link is hidden on events that do not count")
      .not.toContain("counts_for_attendance");
    expect(condition, "the link is offered on events that were never published")
      .toContain('event.status === "published"');
  });

  it("matches what the database allows", () => {
    expect(latestDefinition("check_in_to_event_by_location"), "the database gained a rule the button is copying")
      .not.toContain("counts_for_attendance");
  });
});
