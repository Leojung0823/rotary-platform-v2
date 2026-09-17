import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { definedFunctionNames, latestDefinition } from "@/lib/attendance/latest-definition";

const panel = readFileSync("src/components/events/location-checkin-panel.tsx", "utf8");
const createForm = readFileSync("src/components/events/event-create-form.tsx", "utf8");

describe("定位簽到從活動開始前一小時，開到結束後一小時", () => {
  // It used to be 24 hours before the start to 24 hours after the end. A member
  // could "check in at the venue" from home the previous afternoon, which is
  // the one thing location check-in exists to prevent.

  it("opens an hour before the event starts", () => {
    expect(latestDefinition("event_location_checkin_is_open"))
      .toContain("now() >= p_starts_at - interval '1 hour'");
  });

  it("stays open until an hour after it ends", () => {
    // The two ends measure different things on purpose. Closing an hour after
    // the *start* would shut a two hour meeting halfway through, and someone
    // who arrives late is still at the venue.
    expect(latestDefinition("event_location_checkin_is_open"))
      .toContain("now() <= p_ends_at + interval '1 hour'");
    expect(latestDefinition("event_location_checkin_is_open"), "both ends are measured from the start")
      .not.toMatch(/p_starts_at \+ interval/u);
  });

  it("is given both ends of the event to decide with", () => {
    // A window that closes at the end cannot be computed from the start alone;
    // the signature has to carry it.
    expect(latestDefinition("event_location_checkin_is_open"))
      .toMatch(/p_starts_at timestamptz,\s*p_ends_at timestamptz/u);
  });
});

describe("看得到的，就簽得下去", () => {
  // The window was written out twice: once by the list, once by the check-in
  // itself. Two copies of one rule drift, and when they do a member either sees
  // an event that refuses them, or -- worse -- can check in to one the list
  // never showed.

  const readers = ["list_my_location_checkin_events", "check_in_to_event_by_location"];

  it("has both sides ask the one rule", () => {
    for (const name of readers) {
      expect(latestDefinition(name), `${name} decides the window for itself`)
        .toContain("public.event_location_checkin_is_open(event.starts_at, event.ends_at)");
    }
  });

  it("leaves no second copy of the location window", () => {
    // Derived, not hand-listed: a function that reads venue_latitude is a
    // function deciding location check-in, and none of them may carry a window
    // of its own. A hand-kept list is how the third copy of a rule survives.
    //
    // Scoped deliberately. QR check-in has its own window -- still ±24 hours,
    // still written out in six places -- and that is a different rule that was
    // not asked to change. Widening this guard to every interval would drag it
    // in and make this change about something it is not.
    const carriesItsOwn = definedFunctionNames().filter((name) => {
      if (name === "event_location_checkin_is_open") return false;
      let body = "";
      try { body = latestDefinition(name); } catch { return false; }
      const clean = body.replace(/--[^\n]*/gu, "");
      if (!clean.includes("venue_latitude")) return false;
      return /now\(\)\s*[<>]=?\s*[\w.]*(starts_at|ends_at)/u.test(clean);
    });
    expect(carriesItsOwn, "a location check-in function decides the window for itself")
      .toEqual([]);
  });

  it("is looking at the functions it means to", () => {
    // If venue_latitude stopped appearing anywhere, the rule above would pass
    // by having nothing to check.
    const locationAware = definedFunctionNames().filter((name) => {
      let body = "";
      try { body = latestDefinition(name); } catch { return false; }
      return body.includes("venue_latitude");
    });
    expect(locationAware).toContain("list_my_location_checkin_events");
    expect(locationAware).toContain("check_in_to_event_by_location");
  });

  it("checks a real schema", () => {
    expect(definedFunctionNames().length).toBeGreaterThan(50);
  });
});

describe("時間窗變窄之後，它是「什麼都沒有」最常見的理由", () => {
  it("says so where a member is looking at nothing", () => {
    expect(panel).toContain("活動開始前一小時，到結束後一小時");
    expect(panel, "the member is left without the alternative that does work")
      .toContain("QR");
  });

  it("says so where the officer sets the coordinates", () => {
    // The two screens describe one setting; they must not disagree about it.
    expect(createForm).toContain("活動開始前一小時到結束後一小時");
    expect(createForm).toContain("場地 200 公尺內");
  });
});

describe("時間到就能簽，不必等人手動開啟", () => {
  // Location check-in required an active check-in session -- an officer pressing
  // 開啟. That session exists for QR: a short-lived token on a screen that has to
  // rotate and has to be closeable. Location check-in has nothing of the sort to
  // protect; its credential is the GPS fix, and the window already bounds it.
  //
  // So this is not a scheduler that opens sessions unattended (which would mint
  // QR tokens with nobody watching). It is the dependency removed.

  it("does not make the member wait for a session", () => {
    expect(latestDefinition("list_my_location_checkin_events"), "the list still waits for an officer")
      .not.toContain("event_checkin_sessions");
  });

  it("does not refuse a check-in for want of one", () => {
    expect(latestDefinition("check_in_to_event_by_location"))
      .not.toContain("checkin_session_not_active");
  });

  it("still records the session when one happens to be open", () => {
    // Dropping the link entirely would lose the tie between a QR session and
    // the check-ins that happened during it.
    expect(latestDefinition("check_in_to_event_by_location")).toContain("target_session.id");
  });

  it("keeps QR needing one, because that is what a token is for", () => {
    expect(latestDefinition("check_in_to_dynamic_event")).toContain("event_checkin_sessions");
  });

  it("lets the attendance row carry no session for gps, and still demands one for qr", () => {
    const migration = readFileSync("supabase/migrations/20260917000600_location_checkin_needs_no_session.sql", "utf8");
    expect(migration).toMatch(/checkin_method = 'qr' and checkin_session_id is not null/u);
    expect(migration).toMatch(/or \(checkin_method = 'gps'\)/u);
  });
});
