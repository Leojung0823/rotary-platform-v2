import { describe, expect, it } from "vitest";
import {
  memberHomeCheckinStates,
  memberHomePrimaryAction,
  memberHomeRegistrationStates,
  parseMemberHomeProjection,
} from "./member-home";

const event = {
  event_type: "regular_meeting",
  title: "本週例會",
  location: "扶輪社會館",
  starts_at: "2026-08-12T10:00:00.000Z",
  ends_at: "2026-08-12T12:00:00.000Z",
  registration_state: "not_registered",
  checkin_state: "not_open",
};

const recentEvent = {
  title: "上週例會",
  location: "扶輪社會館",
  starts_at: "2026-08-05T10:00:00.000Z",
  attended: true,
};

function projection(overrides: Record<string, unknown> = {}) {
  return {
    club: { club_code: "MEMBER", club_name: "社員測試社" },
    primary_event: event,
    next_event: null,
    recent_events: [],
    ...overrides,
  };
}

describe("member-home projection contract", () => {
  it("accepts a bounded, identifier-free member projection", () => {
    expect(parseMemberHomeProjection(projection())).toEqual({
      club: { clubCode: "MEMBER", clubName: "社員測試社" },
      primaryEvent: {
        eventType: "regular_meeting",
        title: "本週例會",
        location: "扶輪社會館",
        startsAt: "2026-08-12T10:00:00.000Z",
        endsAt: "2026-08-12T12:00:00.000Z",
        registrationState: "not_registered",
        checkinState: "not_open",
      },
      nextEvent: null,
      recentEvents: [],
    });
  });

  it("accepts bounded recent-events review entries", () => {
    const parsed = parseMemberHomeProjection(projection({ recent_events: [recentEvent] }));
    expect(parsed?.recentEvents).toEqual([
      { title: "上週例會", location: "扶輪社會館", startsAt: "2026-08-05T10:00:00.000Z", attended: true },
    ]);
  });

  it("rejects a recent event with an internal identifier", () => {
    expect(parseMemberHomeProjection(projection({ recent_events: [{ ...recentEvent, id: "internal" }] }))).toBeNull();
  });

  it("rejects more recent events than the bounded maximum", () => {
    const tooMany = [recentEvent, recentEvent, recentEvent, recentEvent];
    expect(parseMemberHomeProjection(projection({ recent_events: tooMany }))).toBeNull();
  });

  it("rejects an internal identifier added to the top-level projection", () => {
    expect(parseMemberHomeProjection(projection({ event_id: "internal" }))).toBeNull();
  });

  it("rejects an internal identifier added to an event", () => {
    expect(parseMemberHomeProjection(projection({ primary_event: { ...event, id: "internal" } }))).toBeNull();
  });

  it("rejects a club projection with an unexpected identity field", () => {
    expect(parseMemberHomeProjection(projection({ club: { club_code: "MEMBER", club_name: "社員測試社", id: "internal" } }))).toBeNull();
  });

  it("rejects an invalid event datetime", () => {
    expect(parseMemberHomeProjection(projection({ primary_event: { ...event, starts_at: "not-a-date" } }))).toBeNull();
  });

  it("rejects an invalid event status", () => {
    expect(parseMemberHomeProjection(projection({ primary_event: { ...event, registration_state: "invented" } }))).toBeNull();
  });

  it("rejects an invalid check-in state", () => {
    expect(parseMemberHomeProjection(projection({ primary_event: { ...event, checkin_state: "invented" } }))).toBeNull();
  });

  it("rejects an oversized title", () => {
    expect(parseMemberHomeProjection(projection({ primary_event: { ...event, title: "a".repeat(161) } }))).toBeNull();
  });

  it("rejects malformed empty-state fields", () => {
    expect(parseMemberHomeProjection(projection({ primary_event: [] }))).toBeNull();
  });

  it("allows a bounded informative next event", () => {
    const parsed = parseMemberHomeProjection(projection({ next_event: { ...event, title: "下一場例會" } }));
    expect(parsed?.nextEvent?.title).toBe("下一場例會");
  });
});

describe("member-home state presentation", () => {
  it.each(memberHomeRegistrationStates)("accepts the canonical registration state %s", (registrationState) => {
    expect(parseMemberHomeProjection(projection({ primary_event: { ...event, registration_state: registrationState } }))?.primaryEvent?.registrationState)
      .toBe(registrationState);
  });

  it.each(memberHomeCheckinStates)("accepts the canonical check-in state %s", (checkinState) => {
    expect(parseMemberHomeProjection(projection({ primary_event: { ...event, checkin_state: checkinState } }))?.primaryEvent?.checkinState)
      .toBe(checkinState);
  });

  it("uses the existing token-entry destination when check-in is available", () => {
    const parsed = parseMemberHomeProjection(projection({ primary_event: { ...event, checkin_state: "available" } }));
    expect(memberHomePrimaryAction(parsed!.primaryEvent!)).toEqual({ href: "/events/checkin", label: "前往簽到" });
  });

  it("uses the existing events destination for a new registration", () => {
    const parsed = parseMemberHomeProjection(projection());
    expect(memberHomePrimaryAction(parsed!.primaryEvent!)).toEqual({ href: "/events", label: "前往報名" });
  });

  it("uses the existing events destination for a pending registration", () => {
    const parsed = parseMemberHomeProjection(projection({ primary_event: { ...event, registration_state: "pending" } }));
    expect(memberHomePrimaryAction(parsed!.primaryEvent!)).toEqual({ href: "/events", label: "確認報名" });
  });

  it("does not expose a check-in route after the member is already checked in", () => {
    const parsed = parseMemberHomeProjection(projection({ primary_event: { ...event, checkin_state: "checked_in" } }));
    expect(memberHomePrimaryAction(parsed!.primaryEvent!)).toEqual({ href: "/events", label: "前往報名" });
  });
});
