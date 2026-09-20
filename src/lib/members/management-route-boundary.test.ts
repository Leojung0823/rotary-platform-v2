import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("member management route boundary", () => {
  const routes = [
    "src/app/(authenticated)/clubs/[clubId]/members/page.tsx",
    "src/app/(authenticated)/clubs/[clubId]/members/[membershipId]/page.tsx",
    "src/app/(authenticated)/clubs/[clubId]/members/archive/page.tsx",
    "src/app/(authenticated)/clubs/[clubId]/members/new/page.tsx",
  ];

  it("denies a tenant URL before any management data or form is rendered", () => {
    for (const route of routes) {
      const body = source(route);
      expect(body, route).toContain("requireClubPermission");
      expect(body, route).toContain('"member.manage"');
    }
  });
});
