import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pendingTaskUrgency, urgentWithinHours } from "./pending-task-urgency";
import type { MemberHomePendingTask } from "@/lib/member-home";

const task = (hoursRemaining: number): MemberHomePendingTask => ({
  kind: "event_response",
  title: "十月例會",
  eventId: "00000000-0000-4000-8000-000000000001",
  deadline: "2026-10-01T10:00:00Z",
  hoursRemaining,
});

describe("how urgent an unanswered registration looks", () => {
  it("calls it urgent inside the threshold and not outside it", () => {
    expect(pendingTaskUrgency(task(urgentWithinHours - 1)).tone).toBe("danger");
    expect(pendingTaskUrgency(task(urgentWithinHours)).tone).toBe("neutral");
  });

  it("never tells a member they have a day left when they have an hour", () => {
    // Rounding up would say 尚餘 1 天 on something closing in sixty-one
    // minutes, and a member who acted tomorrow would have missed it.
    for (const hours of [urgentWithinHours, 95, 96, 120, 167]) {
      const { label } = pendingTaskUrgency(task(hours));
      const days = Number(/尚餘 (\d+) 天/u.exec(label)?.[1]);
      expect(days * 24, `${hours}h must not be reported as more time than it is`)
        .toBeLessThanOrEqual(hours);
    }
  });

  it("rests on the fields the projection actually returns", () => {
    // hoursRemaining is computed in SQL. If that field is renamed or dropped
    // the parser rejects the row, but the filter conditions have no such
    // backstop: widen them and a member is nagged about events that already
    // closed, or that they already answered.
    const migration = readFileSync("supabase/migrations/20260915000400_member_home_pending_tasks.sql", "utf8");
    expect(migration).toContain("'hours_remaining'");
    expect(migration).toContain("'kind', 'event_response'");

    // Inside the awaiting_response CTE, not anywhere in the file. The first
    // draft of this checked the whole migration, and the same phrases already
    // appear in the registration-state logic further up -- so deleting the
    // filter entirely left the test green.
    const start = migration.indexOf("), awaiting_response as (");
    expect(start, "the awaiting_response CTE is gone").toBeGreaterThan(-1);
    const cte = migration.slice(start, migration.indexOf("), presented_events as (", start));
    expect(cte).toContain("now() <= registration_deadline");
    expect(cte).toContain("now() < starts_at");
    expect(cte).toContain("my_response is null or my_response = 'pending'");
  });
});
