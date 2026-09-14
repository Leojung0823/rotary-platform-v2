import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260914001000_update_club_event.sql", "utf8");
const pushContractMigration = readFileSync("supabase/migrations/20260915000100_event_push_version_contract.sql", "utf8");
const actions = readFileSync("src/app/event-actions.ts", "utf8");
const eventPush = readFileSync("src/lib/line/event-push.ts", "utf8");
const form = readFileSync("src/components/events/event-create-form.tsx", "utf8");
const panel = readFileSync("src/components/events/event-management-panel.tsx", "utf8");

describe("editing a published event", () => {
  it("refuses to edit history", () => {
    // A cancelled or finished event is what people were already told.
    expect(migration).toContain("event_not_editable");
    expect(migration).toContain("event_already_finished");
    expect(migration).toContain("target.ends_at <= now()");
  });

  it("cannot retire an event by editing it into the past", () => {
    expect(migration).toContain("or p_ends_at <= now()");
  });

  it("will not strand registrations behind a smaller capacity", () => {
    // Nothing here decides who would lose their seat, so it refuses instead.
    expect(migration).toContain("capacity_below_registrations");
    expect(migration).toContain("registration.response = 'attending'");
  });

  it("refuses a save built on a version someone else has moved on from", () => {
    expect(migration).toContain("event_changed_elsewhere");
    expect(form).toContain('name="expectedVersion"');
  });

  it("notifies only when the time or the place moved", () => {
    // A typo fix that pushed to every member would be noise; a room change that
    // stayed silent would be a failure.
    const notify = migration.slice(migration.indexOf("'notify_members'"));
    const clause = notify.slice(0, notify.indexOf(")"));
    expect(clause).toContain("starts_at");
    expect(clause).toContain("ends_at");
    expect(clause).toContain("location");
    expect(clause).not.toContain("title");
    expect(clause).not.toContain("description");
    expect(notify).toContain("target.event_status = 'published'");
  });

  it("keeps one notification per edit rather than one per event", () => {
    // The old unique index was one push per event, ever, which is right for an
    // announcement and wrong the moment an event can be edited twice.
    expect(migration).toContain("line_push_logs_one_per_event_version");
    expect(migration).toContain("drop index if exists line_push_logs_one_per_event;");
  });

  it("passes the saved version to the versioned push contract", () => {
    expect(actions).toContain("eventVersion");
    expect(eventPush).toContain("p_event_version");
    expect(pushContractMigration).toContain("drop function if exists public.record_club_event_line_push");
    expect(pushContractMigration).toContain("record_club_event_line_push(uuid, uuid, integer, jsonb, text, text, text, integer)");
  });

  it("does not turn a failed push into a failed edit", () => {
    const block = actions.slice(actions.indexOf("outcome?.notify_members === true"));
    expect(block.slice(0, 400)).toContain("catch");
  });

  it("records what changed, field by field", () => {
    // "Wasn't it at 13:30?" has to be answerable afterwards.
    expect(migration).toContain("'event.updated'");
    expect(migration).toContain("jsonb_build_object('from'");
  });

  it("offers the edit link only where the database will accept it", () => {
    expect(panel).toContain('event.status === "draft" || event.status === "published"');
  });
});
