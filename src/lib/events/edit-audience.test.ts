import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { audienceFromEvent, addressesWholeClub } from "@/lib/audience/selection";

function rendered(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/gu, "")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");
}

const actions = rendered("src/app/event-actions.ts");
const editPage = rendered("src/app/(authenticated)/clubs/[clubId]/events/[eventId]/edit/page.tsx");
const form = rendered("src/components/events/event-create-form.tsx");
const migration = readFileSync("supabase/migrations/20260916000400_event_list_audience.sql", "utf8");

/** The body of updateEventAction. */
function updateAction(): string {
  const start = actions.indexOf("export async function updateEventAction");
  expect(start).toBeGreaterThan(-1);
  const next = actions.indexOf("\nfunction updateEventRpcFailure", start);
  return actions.slice(start, next === -1 ? undefined : next);
}

describe("editing an event can change who it is for", () => {
  // The form rendered the picker and the action ignored it, so an officer
  // changed 發送對象 and nothing happened -- no error, no change.
  it("saves the audience the form submitted", () => {
    const body = updateAction();
    expect(body).toContain('supabase.rpc("set_club_event_audience"');
    expect(body).toContain('readUuidList(formData, "audienceTagIds")');
    expect(body).toContain('readUuidList(formData, "audienceMembershipIds")');
  });

  it("sends an empty audience too", () => {
    // Removing every tag widens the event back to the whole club. Creating
    // skips the call when nothing is selected -- there is nothing to clear on
    // a brand new event -- and copying that shape here would make "back to the
    // whole club" the one edit that cannot be made.
    const body = updateAction();
    expect(body).toContain('supabase.rpc("set_club_event_audience"');
    expect(body, "the audience call branches on whether anything is selected")
      .not.toMatch(/if\s*\(\s*targeted\s*\)/u);
    expect(body, "the audience call is guarded by a truthiness check")
      .not.toMatch(/targeted\s*&&\s*(await\s*)?supabase/u);
  });

  it("stops a targeted event from also counting for attendance", () => {
    // The database forbids the combination; forcing it here means the officer
    // meets an explanation rather than a trigger error.
    expect(updateAction()).toContain("validated.input.countsForAttendance && !targeted");
    expect(updateAction()).toContain("p_counts_for_attendance: countsForAttendance");
  });

  it("says so when the audience alone fails to save", () => {
    // The rest of the edit is already committed by then.
    expect(updateAction()).toContain("活動已儲存，但發送對象未更新");
  });
});

describe("the picker opens on what the event already addresses", () => {
  it("is told the current audience", () => {
    expect(migration).toContain("'audience_tag_ids'");
    expect(migration).toContain("'audience_membership_ids'");
    expect(editPage).toContain("audienceFromEvent(");
    expect(editPage).toContain("editing={{ eventId, version: target.version, values, audience }}");
    expect(form).toContain("initial={initialAudience}");
  });

  it("keeps the audience a manager's to see", () => {
    // A member is told whether a venue was set, not where. The audience is the
    // same kind of fact.
    for (const field of ["audience_tag_ids", "audience_membership_ids"]) {
      const at = migration.indexOf(`'${field}'`);
      expect(migration.slice(at, at + 60), `${field} is not gated`).toContain("case when can_manage");
    }
  });

  it("starts the counts-for-attendance control from the same truth", () => {
    // It opened unchecked-and-enabled for a targeted event, which said the
    // event could count when it cannot.
    expect(form).toContain("useState(!addressesWholeClub(initialAudience))");
  });
});

describe("an event with no audience is the whole club", () => {
  it("reads as everyone, not as an empty tag list", () => {
    // "tags, none chosen" renders as a mistake the officer did not make.
    expect(addressesWholeClub(audienceFromEvent([], []))).toBe(true);
    expect(audienceFromEvent([], []).mode).toBe("everyone");
  });

  it("keeps a tagged audience on the tags list", () => {
    const selection = audienceFromEvent(["8f000000-0000-4000-8000-000000000001"], []);
    expect(selection.mode).toBe("tags");
    expect(selection.tagIds).toEqual(["8f000000-0000-4000-8000-000000000001"]);
    expect(addressesWholeClub(selection)).toBe(false);
  });

  it("keeps an individual audience on the members list", () => {
    const selection = audienceFromEvent([], ["6f000000-0000-4000-8000-000000000002"]);
    expect(selection.mode).toBe("members");
    expect(selection.membershipIds).toEqual(["6f000000-0000-4000-8000-000000000002"]);
  });

  it("does not drop the other half when both are set", () => {
    const selection = audienceFromEvent(["8f000000-0000-4000-8000-000000000001"], ["6f000000-0000-4000-8000-000000000002"]);
    expect(selection.tagIds).toHaveLength(1);
    expect(selection.membershipIds).toHaveLength(1);
  });
});
