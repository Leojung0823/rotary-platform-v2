import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const layout = readFileSync("src/app/(authenticated)/clubs/[clubId]/layout.tsx", "utf8");
const console_ = readFileSync("src/app/(authenticated)/platform/clubs/[clubId]/page.tsx", "utf8");

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
