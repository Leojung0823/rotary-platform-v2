import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const projection = latestDefinition("get_my_member_home_projection");

/** The pending_tasks block, which is where a reminder's destination is set. */
const pendingTasks = (() => {
  const from = projection.indexOf("'pending_tasks'");
  const to = projection.indexOf("'notifications'", from);
  expect(from, "pending_tasks is gone from the projection").toBeGreaterThan(-1);
  return projection.slice(from, to);
})();

/**
 * Every destination a task row is given.
 *
 * A path may be a plain literal or built around one (`concat('/dues?yearId=',
 * …)`), so the first string literal after `'action_path',` is taken either way.
 * Missing one silently is the failure this whole file exists to prevent, so the
 * count is checked against the number of rows below.
 */
const destinations = [...pendingTasks.matchAll(/'action_path',\s*(?:concat\()?\s*'([^']+)'/gu)]
  .map((match) => match[1]);

/** Where the App Router would look for that path's page. A query string is not part of the route. */
function pageFor(path: string): string {
  return `src/app/(authenticated)${path.split("?")[0]}/page.tsx`;
}

describe("每一個提醒都要指向真的存在的一頁", () => {
  // 社費未繳 shipped pointing at /me/finance. 我的社費 is at /dues; /me has only
  // line-oa and security under it. The parser checks that a path looks like a
  // relative path on this site -- it did -- so every layer was green and the
  // member who tapped it got a not-found page.
  //
  // "The route exists" is not something to remember while writing SQL. It is
  // the filesystem, and the filesystem can be asked.

  it("reads every row's destination, whatever shape it is written in", () => {
    // If a row's path stops matching -- because it is built a new way -- it
    // drops out of the list below and is checked by nothing, while the count
    // still looks healthy. So the two sides are compared directly.
    const rows = (pendingTasks.match(/'action_path',/gu) ?? []).length;
    expect(rows, "no task rows found; this guard is checking nothing").toBeGreaterThan(3);
    expect(destinations.length, "a row's destination was not read at all").toBe(rows);
  });

  it("finds a page for every one of them", () => {
    expect(destinations.length, "no literal destinations found; this guard is checking nothing")
      .toBeGreaterThan(3);
    const missing = destinations.filter((path) => !existsSync(pageFor(path)));
    expect(missing, "a reminder sends the member to a page that does not exist").toEqual([]);
  });

  it("sends 社費未繳 to 我的社費, on the year that is actually owed", () => {
    // /dues shows one Rotary year at a time and opens on the newest, so a bare
    // /dues showed this year -- settled -- to a member who owes from last.
    expect(destinations.some((path) => path.startsWith("/dues"))).toBe(true);
    expect(destinations, "the link does not say which year").toContain("/dues?yearId=");
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
