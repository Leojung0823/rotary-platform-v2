import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const affairs = latestDefinition("get_club_affairs_page");

function rendered(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/gu, "")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");
}

const page = rendered("src/app/(authenticated)/club-affairs/page.tsx");

/** The subquery that builds the officer list. */
function officers(): string {
  const start = affairs.indexOf("'officers', coalesce((");
  expect(start, "the officers list is gone").toBeGreaterThan(-1);
  return affairs.slice(start, affairs.indexOf("), '[]'::jsonb)", start));
}

describe("a club is introduced by people who are still in it", () => {
  // The list asked only whether the role assignment was active. A membership
  // that was suspended, ended or disabled kept its assignment row, so the club
  // went on being introduced by someone who had left -- on the same card whose
  // member count already excluded them. Leo saw a disabled 秘書 there.
  it("requires an active membership in this club", () => {
    const block = officers();
    expect(block).toContain("public.club_memberships as membership");
    expect(block).toMatch(/membership\.membership_status = 'active'/u);
    expect(block).toMatch(/membership\.club_id = p_club_id/u);
    expect(block).toMatch(/membership\.person_id = person\.id/u);
  });

  it("requires the account itself to be active", () => {
    expect(officers()).toContain("account.account_status = 'active'");
  });

  it("still requires the assignment to be active", () => {
    // The new condition is additional, not a replacement.
    expect(officers()).toContain("assignment.assignment_status = 'active'");
  });

  it("is proven against a real database, not only by reading the SQL", () => {
    // String matching cannot see a clause disabled in place -- `and false and
    // exists (...)` leaves every asserted string present. Only running it can.
    const manifest = readFileSync("scripts/database-verification-files.txt", "utf8");
    expect(manifest).toContain("supabase/verification/club_affairs_officers.sql");
    const verification = readFileSync("supabase/verification/club_affairs_officers.sql", "utf8");
    expect(verification).toContain("'disabled'");
    expect(verification).toContain("is still listed as an officer");
    expect(verification).toContain("a serving officer went missing");
  });

  it("counts members the same way it lists officers", () => {
    // The inconsistency between these two is what made the bug visible.
    const count = affairs.slice(affairs.indexOf("'member_count'"), affairs.indexOf("'officers'"));
    expect(count).toContain("membership.membership_status = 'active'");
    expect(officers()).toContain("membership.membership_status = 'active'");
  });
});

describe("the restatement is built on the definition that was current", () => {
  // The first draft of this migration restated 20260914000800, which
  // 20260914001100 had already superseded with a plain `create function` after
  // a signature change. Applying it would have reverted that work silently --
  // every test would have stayed green, because they all read the migration
  // files and the older text still said what they asked about.
  it("is the superseding definition with the two known changes and nothing else", () => {
    const v2 = readFileSync("supabase/migrations/20260914001100_club_service_plan_v2.sql", "utf8");
    const from = v2.indexOf("create function public.get_club_affairs_page(");
    const previous = v2.slice(from, v2.indexOf("\n$$;", from));

    // Undo exactly what this migration changes; what remains must be the
    // definition it was built on, character for character. Anything else that
    // drifted -- a reverted line, a dropped field -- shows up here.
    const addedOfficerCondition = affairs.slice(
      affairs.indexOf("          -- The role is held by"),
      affairs.indexOf("      ) as officer"),
    );
    const carriedRepair = affairs.slice(
      affairs.indexOf("  -- 20260915000200 repaired this in place"),
      affairs.indexOf("  target_year integer :="),
    );
    const withoutChanges = affairs
      .replace("create or replace function", "create function")
      .replace(addedOfficerCondition, "")
      .replace(carriedRepair, "")
      .replace(
        "  target_year integer := coalesce(p_start_year, extract(year from public.current_rotary_year_start())::integer);",
        "  target_year integer := coalesce(p_start_year, public.current_rotary_year_start());",
      );
    expect(withoutChanges).toBe(previous);
  });

  it("does not undo a repair made in place", () => {
    // 20260915000200 fixed this function by rewriting the text Postgres itself
    // held, not by re-declaring it, so the migration files never showed the
    // fix. Restating from a file therefore reintroduced the bug -- and the
    // only thing that noticed was that migration's own verification, on CI.
    const repair = readFileSync("supabase/migrations/20260915000200_club_service_plan_year_cast.sql", "utf8");
    const corrected = /corrected_declaration text := '([^']+)';/u.exec(repair);
    expect(corrected, "the repair no longer names its corrected text").not.toBeNull();
    expect(affairs, "the restatement dropped an in-place repair").toContain(corrected![1]);

    const broken = /old_declaration text := '([^']+)';/u.exec(repair);
    expect(affairs, "the restatement brought back the text that was repaired")
      .not.toContain(broken![1]);
  });
});

describe("社員標籤 belongs to management mode", () => {
  // canManage says an officer could manage; it does not say they are managing
  // now. An officer reading 社務 as a member is reading it as a member.
  it("is gated on the mode, not only on the permission", () => {
    expect(page).toContain("currentExperienceMode");
    expect(page).toMatch(/const managing =[\s\S]{0,160}mode === "management"/u);
    expect(page).toContain("{managing && <Card>");
  });

  it("does not render the card straight off canManage", () => {
    expect(page).not.toContain("{canManage && <Card>");
  });

  it("still requires the permission as well as the mode", () => {
    expect(page).toMatch(/const managing =[\s\S]{0,200}resolution\.context\.canManage/u);
  });
});

describe("社務頁 follows the shell's active club", () => {
  it("passes the validated active-club cookie into context resolution", () => {
    expect(page).toContain('activeClubCookieName');
    expect(page).toContain('readActiveClubPreference');
    expect(page).toContain('resolveExperienceContext(preferredClubId)');
    expect(page).not.toContain('resolveExperienceContext(null)');
  });
});
