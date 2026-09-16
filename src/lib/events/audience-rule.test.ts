import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { definedFunctionNames, latestDefinition } from "@/lib/attendance/latest-definition";

/**
 * Functions a member can call that read club_events and must therefore respect
 * who an event was addressed to.
 *
 * Every one of these is checked for the rule; the last test proves the list is
 * complete, so a new reader cannot be added without being classified.
 */
const memberFacingEventReaders = [
  "list_club_events",
  "get_my_club_event",
  "list_my_event_page",
  "get_my_member_home_projection",
  // A write, and the more serious half: the lists never offered a targeted
  // event, but nothing refused a registration for one.
  "set_my_event_registration",
];

/**
 * The self-service check-in paths. Each is keyed on a token, a credential or an
 * event id the member already holds rather than listing events, but each still
 * writes an attendance row, so each must refuse an event the member was never
 * addressed to.
 */
const selfCheckinPaths = [
  "check_in_to_event",
  "check_in_to_dynamic_event",
  "check_in_to_event_by_location",
  "list_my_location_checkin_events",
];

/**
 * Functions that read club_events but are not a member's view of them: they
 * either require a management permission of their own, are keyed on an event
 * the member is already attending, or answer about the club rather than about
 * which events exist.
 */
const notAMemberEventList = new Set([
  // Check-in: the member is holding a token or standing at the venue for an
  // event, not being shown a list of events to choose from.
  "open_event_checkin", "rotate_event_checkin_token", "close_event_checkin",
  "manual_check_in_event", "revoke_event_attendance",
  "get_event_checkin_overview", "open_dynamic_event_checkin",
  "issue_dynamic_event_checkin_credential",
  "close_checkin_sessions_on_terminal_event",
  // Attendance: a rate, computed over events that already happened.
  "attendance_result_for_member", "attendance_membership_is_eligible",
  "list_my_attendance_history", "get_my_attendance_summary",
  "get_event_attendance_roster", "set_attendance_adjustment",
  "get_club_attendance_summary", "export_event_attendance_csv",
  "list_club_attendance_events", "revoke_attendance_adjustment",
  // Management, each with its own permission check.
  "create_club_event", "update_club_event", "publish_club_event",
  "cancel_club_event", "set_club_event_audience", "list_club_event_line_targets",
  "record_club_event_line_push", "can_manage_event_covers", "can_view_event_covers",
  "current_can_manage_active_club_events", "current_can_manage_club_events",
  "current_can_access_club_events", "current_can_manage_event_checkin",
  "event_includes_current_member",
  "reject_counted_targeted_event", "reject_audience_on_counted_event",
  "protect_event_checkin_session_update", "protect_event_attendance_update",
  "prevent_event_attendance_hard_delete", "protect_event_checkin_qr_credential_update",
  "cleanup_expired_dynamic_checkin_credentials",
  "set_club_event_cover",
]);

/** The rule, applied directly or through a function that applies it. */
function appliesAudienceRule(name: string, seen = new Set<string>()): boolean {
  if (seen.has(name)) return false;
  seen.add(name);
  let body: string;
  try {
    body = latestDefinition(name);
  } catch {
    return false;
  }
  if (body.includes("public.event_includes_current_member(")) return true;
  // Delegation counts: get_my_club_event asks list_club_events, which applies
  // it. Requiring the literal clause everywhere would push people to duplicate
  // the rule, which is how two copies drift apart.
  return [...body.matchAll(/public\.([a-z0-9_]+)\(/gu)]
    .map((match) => match[1])
    .some((callee) => callee !== name && appliesAudienceRule(callee, seen));
}

describe("an event addressed to some members is invisible to the rest", () => {
  // The member home never applied the rule. A targeted event appeared on every
  // member's home page -- featured, with a 前往報名 button, and as a 待辦提醒
  // telling them to answer -- while /events correctly refused to show it.
  it.each(memberFacingEventReaders)("%s respects the audience", (name) => {
    expect(appliesAudienceRule(name)).toBe(true);
  });

  it.each(selfCheckinPaths)("%s refuses to record someone who was not addressed", (name) => {
    // Being handed a QR code, or standing at the venue, is not an invitation.
    expect(appliesAudienceRule(name)).toBe(true);
  });

  it("applies it to the home's past events as well as its upcoming ones", () => {
    // An event a member was never addressed to does not become theirs to
    // review once it is over.
    const projection = latestDefinition("get_my_member_home_projection");
    const occurrences = projection.match(/public\.event_includes_current_member\(/gu) ?? [];
    expect(occurrences.length, "the projection reads events in two places").toBe(2);
  });
});

describe("the rule is proven against a real database", () => {
  it("has a verification that exercises every path at once", () => {
    // String matching says the clause is present. Only running it says the
    // uninvited member cannot reach the event -- and that the invited one
    // still can, which a fix that hid it from everyone would also satisfy.
    const manifest = readFileSync("scripts/database-verification-files.txt", "utf8");
    expect(manifest).toContain("supabase/verification/member_home_audience.sql");
    const verification = readFileSync("supabase/verification/member_home_audience.sql", "utf8");
    for (const claim of [
      "the invited member lost their own event",
      "a targeted event reached an uninvited home page",
      "a past targeted event reached an uninvited review list",
      "a targeted event reached an uninvited GPS list",
      "an uninvited member registered for a targeted event",
    ]) {
      expect(verification, `the verification no longer checks: ${claim}`).toContain(claim);
    }
  });
});

describe("the list of member-facing readers is complete", () => {
  // The generalisation: a new function that shows a member which events exist
  // must be classified, not silently added. This is what would have caught the
  // home projection when it was written.
  it("classifies every function that reads club_events", () => {
    const unclassified = definedFunctionNames().filter((name) => {
      if (memberFacingEventReaders.includes(name)) return false;
      if (selfCheckinPaths.includes(name)) return false;
      if (notAMemberEventList.has(name)) return false;
      let body: string;
      try {
        body = latestDefinition(name);
      } catch {
        return false;
      }
      return body.includes("public.club_events");
    });
    expect(unclassified, "classify these as member-facing or not").toEqual([]);
  });

  it("lets nothing be exempted without a reason a machine can see", () => {
    // The exemption set is the escape hatch: moving a member-facing reader
    // into it silences the guard above. So each entry must qualify on its own
    // terms -- it is keyed on one event the caller already holds, it checks a
    // permission of its own, or it is a trigger. A function that takes only a
    // club id and asks nothing extra is a member's list of events, whatever
    // list it has been put in.
    const unjustified = [...notAMemberEventList].filter((name) => {
      const body = latestDefinition(name);
      const signature = body.slice(0, body.indexOf(")"));
      const keyedOnOneThing = /p_(event_id|credential|token|attendance_id|membership_id)/u.test(signature);
      const checksItsOwnPermission = /current_has_club_permission|current_can_manage|current_can_access_club_events|attendance_manage_required|current_can_manage_event_checkin/u.test(body);
      const isTrigger = /returns trigger/u.test(body);
      // A function that only ever looks at events counting toward the
      // attendance rate cannot see a targeted one: club_events_reject_counted_targeted
      // and club_event_audiences_reject_counted make the two mutually
      // exclusive at the database level, in both directions.
      const countsOnly = /counts_for_attendance/u.test(body);
      return !keyedOnOneThing && !checksItsOwnPermission && !isTrigger && !countsOnly;
    });
    expect(unjustified, "these are exempted but look like a member's event list").toEqual([]);
  });

  it("keeps the attendance exemption honest", () => {
    // The exemption above leans on two triggers. If either is ever dropped, a
    // targeted event could count toward attendance and the functions exempted
    // by counts_for_attendance would start seeing it.
    const reject = latestDefinition("reject_counted_targeted_event");
    expect(reject).toContain("targeted_event_cannot_count_for_attendance");
    const rejectAudience = latestDefinition("reject_audience_on_counted_event");
    expect(rejectAudience).toContain("targeted_event_cannot_count_for_attendance");
  });

  it("puts nothing in more than one list", () => {
    const all = [...memberFacingEventReaders, ...selfCheckinPaths, ...notAMemberEventList];
    expect(all.length, "a name appears in two lists").toBe(new Set(all).size);
  });

  it("names only functions that exist", () => {
    for (const name of [...memberFacingEventReaders, ...selfCheckinPaths, ...notAMemberEventList]) {
      expect(() => latestDefinition(name), `${name} is named but not defined`).not.toThrow();
    }
  });
});
