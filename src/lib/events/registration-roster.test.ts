import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";
import { parseRegistrationRoster, rosterSummary } from "./registration-roster";

const row = {
  membership_id: "6f000000-0000-4000-8000-000000000002",
  display_name: "王社友",
  response: "attending",
  guest_count: 2,
  note: "來電告知",
  responded_at: "2026-09-16T02:00:00.000Z",
};

describe("the roster is validated, not trusted", () => {
  it("accepts what the RPC emits", () => {
    const parsed = parseRegistrationRoster({ members: [row] });
    expect(parsed?.[0].displayName).toBe("王社友");
    expect(parsed?.[0].guestCount).toBe(2);
  });

  it("accepts a member who has never answered", () => {
    const parsed = parseRegistrationRoster({
      members: [{ ...row, response: "no_reply", guest_count: 0, note: "", responded_at: null }],
    });
    expect(parsed?.[0].response).toBe("no_reply");
    expect(parsed?.[0].respondedAt).toBeNull();
  });

  // A read that failed is not "nobody registered". The card says so instead.
  it.each([
    ["not an object", []],
    ["no members array", { rows: [] }],
    ["a response nobody defines", { members: [{ ...row, response: "maybe" }] }],
    ["a guest count that is not a number", { members: [{ ...row, guest_count: "2" }] }],
    ["a negative guest count", { members: [{ ...row, guest_count: -1 }] }],
    ["an id that is not a uuid", { members: [{ ...row, membership_id: "x" }] }],
    ["an empty name", { members: [{ ...row, display_name: "" }] }],
  ])("rejects %s", (_name, value) => {
    expect(parseRegistrationRoster(value)).toBeNull();
  });
});

describe("the summary counts what an officer is counting", () => {
  it("counts spots, not people, for guests", () => {
    const entries = parseRegistrationRoster({
      members: [row, { ...row, membership_id: "6f000000-0000-4000-8000-000000000003", guest_count: 0 }],
    })!;
    const summary = rosterSummary(entries);
    expect(summary.attending).toBe(2);
    // (1 member + 2 guests) + (1 member + 0 guests)
    expect(summary.spots).toBe(4);
  });

  it("puts no_reply and pending together as still to chase", () => {
    // They are different facts and kept apart in the table, but an officer
    // chasing replies is chasing both.
    const entries = parseRegistrationRoster({
      members: [
        { ...row, response: "no_reply", guest_count: 0, responded_at: null },
        { ...row, membership_id: "6f000000-0000-4000-8000-000000000004", response: "pending", guest_count: 0 },
        { ...row, membership_id: "6f000000-0000-4000-8000-000000000005", response: "declined", guest_count: 0 },
      ],
    })!;
    const summary = rosterSummary(entries);
    expect(summary.awaiting).toBe(2);
    expect(summary.declined).toBe(1);
    expect(summary.attending).toBe(0);
  });
});

describe("answering for a member is recorded and bounded", () => {
  const setter = latestDefinition("set_event_registration_for_member");

  it("requires event.manage, not just membership", () => {
    expect(setter).toContain("current_has_club_permission(p_club_id, 'event.manage')");
    expect(setter).toContain("'42501'");
  });

  it("requires a reason", () => {
    // Answering for someone else happened off-system -- a phone call, a
    // message. Saying which is how the member can later see why their answer
    // is what it is, and how the club can answer for the change.
    expect(setter).toContain("registration_reason_required");
    expect(setter).toMatch(/normalized_reason = ''/u);
  });

  it("writes the reason where the member can see it", () => {
    expect(setter).toMatch(/note,\s*responded_at/u);
    expect(setter).toContain("normalized_reason, case when p_response = 'pending'");
  });

  it("records who did it, for whom, and why", () => {
    const audit = setter.slice(setter.indexOf("insert into public.audit_logs"));
    expect(audit).toContain("event.registration_set_by_officer");
    expect(audit).toContain("'membership_id', p_membership_id");
    expect(audit).toContain("'reason', normalized_reason");
  });

  it("still respects capacity", () => {
    expect(setter).toContain("event_capacity_full");
  });

  it("refuses a member the event was never sent to", () => {
    expect(setter).toContain("public.membership_is_in_event_audience(p_event_id, p_membership_id)");
    expect(setter).toContain("membership_not_available");
  });

  it("does not apply the registration deadline", () => {
    // The member phoning an hour before the meeting is the case this exists
    // for. The officer carries it, and the audit row records that they did.
    expect(setter).not.toContain("registration_deadline");
  });
});

describe("the roster lists who was asked, not only who replied", () => {
  const list = latestDefinition("list_club_event_registrations");

  it("starts from the club's active members", () => {
    expect(list).toContain("public.club_memberships as membership");
    expect(list).toContain("membership.membership_status = 'active'");
    expect(list).toContain("left join public.event_registrations");
  });

  it("calls a member with no row no_reply", () => {
    expect(list).toContain("coalesce(registration.response, 'no_reply')");
  });

  it("lists the audience for a targeted event, not the whole club", () => {
    expect(list).toContain("public.membership_is_in_event_audience(p_event_id, membership.id)");
  });

  it("requires event.manage", () => {
    expect(list).toContain("current_has_club_permission(p_club_id, 'event.manage')");
  });
});

describe("the officer's own club is the only one they can touch", () => {
  it("keeps the internal audience helper away from callers", () => {
    const migration = readFileSync(
      "supabase/migrations/20260916000600_manage_event_registrations.sql",
      "utf8",
    );
    expect(migration).toContain(
      "revoke all on function public.membership_is_in_event_audience(uuid, uuid) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.set_event_registration_for_member(uuid, uuid, uuid, text, integer, text) to authenticated",
    );
  });
});
