import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const projection = latestDefinition("get_my_member_home_projection");
const rule = latestDefinition("birthday_wish_action_status");

/** The branch of pending_tasks that decides whether a wish is still owed. */
const taskBranch = (() => {
  const from = projection.indexOf("birthday_wishes_to_write as (");
  expect(from, "the birthday task branch is gone").toBeGreaterThan(-1);
  return projection.slice(from, projection.indexOf("), profile_gaps", from));
})();

describe("社員寫完了，提醒就該消失", () => {
  // The task asked whether the wish had been *published*. Publishing is the
  // officer's action. A member who wrote and sent theirs had nothing left to
  // do and was still told 「生日祝福待填寫」 -- while the notice for the very
  // same assignment, built from the very same statuses ten lines below, had
  // already called it completed. One question, two answers, same function.

  it("treats a sent wish as done", () => {
    expect(rule).toMatch(/p_submission_status in \('submitted', 'published'\) then 'completed'/u);
  });

  it("still asks for one the officer sent back", () => {
    // hidden means 重寫; that is the member's task again, not a finished one.
    expect(rule).toMatch(/p_submission_status = 'hidden' then 'needs_resubmission'/u);
    expect(taskBranch).toContain("'needs_resubmission'");
  });

  it("asks the shared rule rather than a second copy of it", () => {
    expect(taskBranch).toContain("public.birthday_wish_action_status(");
    expect(taskBranch, "the branch still decides this for itself")
      .not.toMatch(/submission_status\s*(<>|=|in)\s*'?\(?'published'/u);
  });

  it("makes the notice ask it too, so the two cannot drift apart", () => {
    // Leaving one side inlined is how they disagreed in the first place: both
    // were correct when written, and nothing was watching them together.
    const deliveries = projection.slice(projection.indexOf("message_deliveries as materialized"));
    const assignment = deliveries.slice(0, deliveries.indexOf("as birthday_assignment"));
    expect(assignment).toContain("public.birthday_wish_action_status(");
    expect(assignment, "the notice keeps its own copy of the case")
      .not.toContain("then 'needs_resubmission'");
  });

  it("gives exactly one definition of the rule", () => {
    const copies = projection.match(/then 'needs_resubmission'/gu) ?? [];
    expect(copies.length, "the classification is written out inside the projection").toBe(0);
  });
});
