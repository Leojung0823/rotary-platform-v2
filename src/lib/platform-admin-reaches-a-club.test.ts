import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const layout = readFileSync("src/app/(authenticated)/clubs/[clubId]/layout.tsx", "utf8");
const console_ = readFileSync("src/app/(authenticated)/platform/clubs/[clubId]/page.tsx", "utf8");

/**
 * Club pages that decide access from the experience context.
 *
 * This used to be a problem: clubsForExperienceMode returned nothing for a
 * platform admin, so any page gating on it refused them. That is fixed at the
 * source -- resolve_my_experience_context now carries every club for a platform
 * role, the way current_has_club_permission always has -- so gating on the
 * context and gating on the database now give the same answer.
 *
 * The list stays because it is still worth knowing which pages ask the context
 * rather than the database: they are the ones that break first if the two ever
 * drift apart again.
 */
const contextGatedByDesign = ["dues"];

describe("介面不要比資料庫嚴格", () => {
  // A platform admin holds every club permission -- current_has_club_permission
  // grants it in its first clause. The club-management layout refused them
  // anyway, because their mode is "platform" and the layout only admitted
  // "management". Meanwhile the platform console renders a 管理社員 button that
  // points straight at it: a door shown and then declared not theirs.

  it("has the database grant a platform admin every club permission", () => {
    const rule = latestDefinition("current_has_club_permission");
    expect(rule).toMatch(/current_has_platform_role\(array\['superadmin', 'platform_admin'\]\)/u);
  });

  it("lets platform mode render a club management page", () => {
    expect(layout, "platform mode is still turned away at the door")
      .toMatch(/mode !== "platform"/u);
  });

  it("still turns member mode away", () => {
    // The layout's job, stated in its own comment: stop a member-mode URL from
    // rendering a management page. Widening it must not drop that.
    expect(layout).toContain("isManagementMode(mode)");
    expect(layout).toContain('x-rotary-requested-mode');
  });

  it("keeps the child page as the authority", () => {
    // Nothing here grants access; it stops pre-empting a decision the RPC makes.
    expect(layout).toContain("RPC/RLS checks remain the authority");
  });

  it("keeps the button that led here, now that it leads somewhere", () => {
    // Removing the button would have been the other way to make these agree,
    // and the wrong one: the platform admin genuinely needs the page.
    expect(console_).toContain("管理社員");
    expect(console_).toMatch(/\/clubs\/\$\{clubId\}\/members\?mode=management/u);
  });
});


describe("誰可以進來，由資料庫決定", () => {
  // Every club sub-page is behind one layout and then its own RPC. A page that
  // instead asks "which clubs may I manage" of the experience context is asking
  // a different question -- one a platform admin answers with "none" while the
  // database answers "all of them".
  const clubPages = (() => {
    const base = "src/app/(authenticated)/clubs/[clubId]";
    return readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const path = `${base}/${entry.name}/page.tsx`;
        return existsSync(path) ? [{ name: entry.name, source: readFileSync(path, "utf8") }] : [];
      });
  })();

  it("is reading a real set of pages", () => {
    expect(clubPages.length).toBeGreaterThan(6);
    expect(clubPages.map((page) => page.name)).toContain("members");
    expect(clubPages.map((page) => page.name)).toContain("operators");
  });

  it("leaves 管理社員 and 管理執行秘書 to the layout and the RPC", () => {
    // The two the platform console links to. Neither may add a gate of its own.
    for (const name of ["members", "operators"]) {
      const page = clubPages.find((entry) => entry.name === name);
      expect(page, `${name} is gone`).toBeTruthy();
      expect(page!.source, `${name} decides access for itself`)
        .not.toContain("clubsForExperienceMode");
    }
  });

  it("keeps the list of context-gated pages from growing quietly", () => {
    const gated = clubPages
      .filter((page) => page.source.includes("clubsForExperienceMode"))
      .map((page) => page.name)
      .sort();
    expect(gated, "another club page now refuses a platform admin on its own")
      .toEqual([...contextGatedByDesign].sort());
  });
});
