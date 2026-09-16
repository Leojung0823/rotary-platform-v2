import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";
import { validateEventCreateForm, type EventCreateFormValues } from "@/lib/events/validation";

const migration = readFileSync("supabase/migrations/20260916000500_optional_registration_deadline.sql", "utf8");

const form: EventCreateFormValues = {
  eventType: "regular_meeting",
  title: "每週例會",
  startsAt: "2026-09-17T18:30",
  endsAt: "2026-09-17T20:30",
  registrationDeadline: "",
  capacity: "",
  location: "會館",
  venueLocation: "",
  countsForAttendance: true,
  description: "",
};

describe("報名截止可以留空", () => {
  // A club that meets every week does not set a deadline for its own regular
  // meeting; requiring one made officers invent a time and then answer for it.
  it("accepts a blank deadline", () => {
    const result = validateEventCreateForm(form);
    expect(result.ok, JSON.stringify(result.ok ? {} : result.fieldErrors)).toBe(true);
    if (result.ok) expect(result.input.registrationDeadline).toBeNull();
  });

  it("still parses one that is given", () => {
    const result = validateEventCreateForm({ ...form, registrationDeadline: "2026-09-17T12:00" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input.registrationDeadline).toBe("2026-09-17T04:00:00.000Z");
  });

  it("still rejects one that is malformed", () => {
    // Blank is a decision; "17/9" is a mistake, and treating every unparseable
    // value as "no deadline" would swallow it.
    const result = validateEventCreateForm({ ...form, registrationDeadline: "17/9" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.registrationDeadline).toBeTruthy();
  });

  it("still rejects one after the event starts", () => {
    const result = validateEventCreateForm({ ...form, registrationDeadline: "2026-09-18T12:00" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.registrationDeadline).toContain("不得晚於");
  });

  it("says it is optional where the officer reads it", () => {
    const createForm = readFileSync("src/components/events/event-create-form.tsx", "utf8");
    expect(createForm).toContain("報名截止（台北，選填）");
    expect(createForm).toContain("留空表示不設截止時間，活動結束前都可以報名。");
    const field = createForm.slice(createForm.indexOf('name="registrationDeadline"') - 200, createForm.indexOf('name="registrationDeadline"') + 40);
    expect(field, "the input is still marked required").not.toContain("required");
  });
});

describe("the column and the rule agree about blank", () => {
  it("drops the not null constraint", () => {
    expect(migration).toContain("alter column registration_deadline drop not null");
  });

  it("keeps registration open until the event ends", () => {
    const rule = latestDefinition("event_registration_is_open");
    expect(rule).toContain("when p_registration_deadline is null then now() < p_ends_at");
  });

  it("preserves the existing behaviour exactly when a deadline is set", () => {
    // `now() = registration_deadline` was open before and must stay open: a
    // single now() < least(deadline, starts_at) would have closed registration
    // one instant early for every event that already has a deadline.
    const rule = latestDefinition("event_registration_is_open");
    expect(rule).toContain("now() <= p_registration_deadline and now() < p_starts_at");
    expect(rule).not.toContain("least(");
  });

  it("counts down to the end when there is no deadline", () => {
    const closes = latestDefinition("event_registration_closes_at");
    expect(closes).toContain("coalesce(p_registration_deadline, p_ends_at)");
    expect(latestDefinition("get_my_member_home_projection"))
      .toContain("public.event_registration_closes_at(task.registration_deadline, task.ends_at)");
  });
});

describe("a blank deadline is rendered as a sentence, not as nothing", () => {
  it.each([
    "src/app/(authenticated)/events/page.tsx",
    "src/components/events/event-management-panel.tsx",
  ])("%s says what blank means", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("event.registration_deadline === null");
    expect(source).toContain("不設截止，活動結束前都可報名");
  });

  it("opens the edit form with the field empty rather than with a date", () => {
    const edit = readFileSync("src/app/(authenticated)/clubs/[clubId]/events/[eventId]/edit/page.tsx", "utf8");
    expect(edit).toContain("target.registration_deadline === null");
  });
});
