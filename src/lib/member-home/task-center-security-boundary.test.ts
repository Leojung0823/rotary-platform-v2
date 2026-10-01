import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(authenticated)/tasks/page.tsx", "utf8");

describe("member task center stays inside the member and club boundary", () => {
  it("uses the member experience and verifies the selected club against memberships", () => {
    expect(page).toContain('activeClubForMode(contextResolution.context, "member")');
    expect(page).toContain("contextResolution.context.memberClubs.find");
    expect(page).not.toContain("managedOnlyClubs");
  });

  it("uses the authenticated caller's task RPC and checks the returned club", () => {
    expect(page).toContain('supabase.rpc("list_my_member_pending_tasks"');
    expect(page).toContain("parseMemberTaskPage(taskResult.data");
    expect(page).toContain("clubId: activeClub.clubId");
    expect(page).toContain('key: "member_home_v2"');
  });

  it("does not accept manager mode", () => {
    expect(page).toContain('mode === "management"');
    expect(page).toContain('redirect("/access-denied")');
  });
});
