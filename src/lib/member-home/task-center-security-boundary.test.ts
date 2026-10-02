import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(authenticated)/tasks/page.tsx", "utf8");

describe("member task center stays inside the member and club boundary", () => {
  const migration = readFileSync("supabase/migrations/20261002000400_joy_iou_member_tasks.sql", "utf8");

  it("uses the member experience and verifies the selected club against memberships", () => {
    expect(page).toContain('activeClubForMode(contextResolution.context, "member")');
    expect(page).toContain("contextResolution.context.memberClubs.find");
    expect(page).not.toContain("managedOnlyClubs");
  });

  it("uses the authenticated caller's task RPC and checks the returned club", () => {
    expect(page).toContain('supabase.rpc("list_my_member_pending_tasks_with_joy_tasks"');
    expect(page).toContain("parseMemberTaskPage(taskResult.data");
    expect(page).toContain("clubId: activeClub.clubId");
    expect(page).toContain('key: "member_home_v2"');
    expect(page).toContain('key: "joy_wall_v1"');
    expect(page).toContain("p_include_joy_tasks: joyEvaluation.enabled");
    expect(migration).toContain("public.list_my_member_pending_tasks(uuid,integer,integer,boolean)'");
    expect(migration).toContain("pg_get_functiondef(");
    expect(migration).toContain("public.list_my_member_pending_tasks(uuid,integer,integer,boolean)");
    expect(migration).toContain("joy_question_actionable");
    expect(migration).toContain("answer.comment_type = 'answer'");
    expect(migration).toContain("focusPostId=");
  });

  it("does not accept manager mode", () => {
    expect(page).toContain('mode === "management"');
    expect(page).toContain('redirect("/access-denied")');
  });
});
