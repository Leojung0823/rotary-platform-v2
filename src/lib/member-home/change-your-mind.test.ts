import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";
import { memberHomePrimaryAction, parseMemberHomeProjection } from "@/lib/member-home";

const baseEvent = {
  event_type: "regular_meeting",
  title: "9月份理事會",
  location: "大拙匠人食品有限公司",
  cover_image_path: null,
  starts_at: "2026-09-17T10:30:00.000Z",
  ends_at: "2026-09-17T12:30:00.000Z",
  registration_state: "declined",
  registration_open: true,
  checkin_state: "not_open",
};

function eventWith(overrides: Record<string, unknown>) {
  const parsed = parseMemberHomeProjection({
    club: { club_code: "P-BRIGHT", club_name: "板橋群英扶輪社" },
    primary_event: { ...baseEvent, ...overrides },
    next_event: null,
    recent_events: [],
    upcoming_events: [],
    pending_tasks: [],
    notifications: { unread_count: 0, items: [] },
  });
  expect(parsed?.primaryEvent, "the projection no longer parses").not.toBeNull();
  return parsed!.primaryEvent!;
}

describe("a member who declined is offered the way back", () => {
  // registration_state stops mentioning the deadline the moment there is a
  // response, so "declined" alone cannot tell "you can still change your mind"
  // from "it is too late". The card used to say 查看活動 either way.
  it("offers 改為報名 while registration is open", () => {
    expect(memberHomePrimaryAction(eventWith({ registration_open: true })).label).toBe("改為報名");
  });

  it("does not offer it once the deadline has passed", () => {
    expect(memberHomePrimaryAction(eventWith({ registration_open: false })).label).not.toBe("改為報名");
  });

  it("still puts check-in first when check-in is open", () => {
    // Being able to change your mind never outranks an event happening now.
    const action = memberHomePrimaryAction(eventWith({ checkin_state: "available" }));
    expect(action.label).toBe("前往簽到");
  });

  it("does not offer it to someone who never answered", () => {
    for (const state of ["not_registered", "pending", "registered", "registration_closed"]) {
      expect(memberHomePrimaryAction(eventWith({ registration_state: state })).label).not.toBe("改為報名");
    }
  });
});

describe("registration_open comes from the database, not from the page", () => {
  const projection = latestDefinition("get_my_member_home_projection");

  it("is emitted beside the state it corrects", () => {
    expect(projection).toContain("'registration_open', public.event_registration_is_open(");
  });

  it("is rejected when it is not a boolean", () => {
    // A projection that silently drops the field would make every declined
    // member look as though the deadline had passed.
    for (const value of ["true", 1, null, undefined]) {
      const parsed = parseMemberHomeProjection({
        club: { club_code: "P-BRIGHT", club_name: "板橋群英扶輪社" },
        primary_event: { ...baseEvent, registration_open: value },
        next_event: null,
        recent_events: [],
        upcoming_events: [],
        pending_tasks: [],
        notifications: { unread_count: 0, items: [] },
      });
      expect(parsed, `registration_open accepted ${String(value)}`).toBeNull();
    }
  });

  it("asks the same question the events page asks", () => {
    // Two pages disagreeing about whether registration is open is the bug
    // this replaces, not a new one to introduce. They now ask by calling the
    // same function, which is the strongest form of "the same question" --
    // copies of a comparison are how they drifted apart in the first place.
    const list = latestDefinition("list_club_events");
    expect(list).toContain("public.event_registration_is_open(");
    expect(projection).toContain("public.event_registration_is_open(");
  });

  it("leaves no hand-written copy of the rule behind", () => {
    // The rule was written out in five places. Any left behind is one that
    // will not learn about a blank deadline.
    for (const [name, body] of [
      ["list_club_events", latestDefinition("list_club_events")],
      ["the home projection", projection],
      ["set_my_event_registration", latestDefinition("set_my_event_registration")],
    ] as const) {
      expect(body, `${name} still compares the deadline by hand`)
        .not.toMatch(/now\(\)\s*[<>]=?\s*\w*\.?registration_deadline/u);
    }
  });
});

describe("the label is not quietly reworded", () => {
  it("keeps 改為報名 wherever the portal reads it", () => {
    const source = readFileSync("src/lib/member-home.ts", "utf8");
    expect(source).toContain('label: "改為報名"');
  });
});
