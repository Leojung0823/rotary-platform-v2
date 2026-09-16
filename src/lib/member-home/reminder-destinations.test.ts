import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const projection = latestDefinition("get_my_member_home_projection");

/** Every destination the projection writes as a literal, not from a column. */
const destinations = [...projection.matchAll(/'action_path',\s*'([^']+)'/gu)]
  .map((match) => match[1]);

/** Where the App Router would look for that path's page. */
function pageFor(path: string): string {
  return `src/app/(authenticated)${path}/page.tsx`;
}

describe("每一個提醒都要指向真的存在的一頁", () => {
  // 社費未繳 shipped pointing at /me/finance. 我的社費 is at /dues; /me has only
  // line-oa and security under it. The parser checks that a path looks like a
  // relative path on this site -- it did -- so every layer was green and the
  // member who tapped it got a not-found page.
  //
  // "The route exists" is not something to remember while writing SQL. It is
  // the filesystem, and the filesystem can be asked.

  it("finds a page for every one of them", () => {
    expect(destinations.length, "no literal destinations found; this guard is checking nothing")
      .toBeGreaterThan(3);
    const missing = destinations.filter((path) => !existsSync(pageFor(path)));
    expect(missing, "a reminder sends the member to a page that does not exist").toEqual([]);
  });

  it("sends 社費未繳 to 我的社費, which is /dues", () => {
    expect(destinations).toContain("/dues");
    expect(destinations, "/me/finance was never a route").not.toContain("/me/finance");
  });

  it("asks the filesystem rather than a list written here", () => {
    // A guard that carried its own list of valid routes would go stale the
    // moment a page moved, and would still pass while the reminder 404s.
    expect(existsSync(pageFor("/dues"))).toBe(true);
    expect(existsSync(pageFor("/me/finance")), "this guard cannot tell a real route from a made-up one")
      .toBe(false);
  });
});
