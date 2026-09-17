import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every route the App Router serves, with dynamic segments left in place. */
function routes(dir = "src/app", prefix = ""): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) {
      return entry === "page.tsx" || entry === "route.ts" ? [prefix || "/"] : [];
    }
    // A route group -- (authenticated) -- is a folder that is not a segment.
    return routes(path, prefix + (entry.startsWith("(") ? "" : `/${entry}`));
  });
}

function sourceFiles(dir = "src"): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(path) && !path.includes(".test.") ? [path] : [];
  });
}

const served = routes();

function isServed(path: string): boolean {
  return served.some((route) => new RegExp(`^${route.replace(/\[[^\]]+\]/gu, "[^/]+")}$`, "u").test(path));
}

/** Complete static in-app destinations: href="/x" and redirect("/x"). */
function destinations(): { path: string; file: string }[] {
  const found: { path: string; file: string }[] = [];
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    const patterns = [/href=\{?(["`])(\/[^"`]*)\1/gu, /redirect\(\s*(["`])(\/[^"`]*)\1/gu];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const raw = match[2];
        // A template literal with a hole is a family of paths, not one; the
        // dynamic route it lands on is matched by shape, not by text.
        if (raw.includes("${")) continue;
        const path = raw.split("?")[0].split("#")[0].replace(/\/$/u, "") || "/";
        if (path.startsWith("/api")) continue;
        found.push({ path, file });
      }
    }
  }
  return found;
}

describe("每一個站內連結都要指向真的存在的一頁", () => {
  // 社費未繳 shipped pointing at /me/finance for a day. 我的社費 is at /dues;
  // /me has only line-oa and security under it. Nothing anywhere checks that a
  // path a human typed is a path this app serves -- typecheck cannot, because a
  // route is a directory, not a type. So a member tapped a reminder and got a
  // not-found page, with every gate green.
  //
  // That one was in SQL and has its own guard. This is the same question asked
  // of the React side.

  it("has routes and destinations to compare", () => {
    expect(served.length, "no routes found; this guard is checking nothing").toBeGreaterThan(20);
    expect(destinations().length, "no destinations found; this guard is checking nothing")
      .toBeGreaterThan(20);
  });

  it("serves every one of them", () => {
    const missing = destinations()
      .filter(({ path }) => !isServed(path))
      .map(({ path, file }) => `${path} (${file})`);
    expect([...new Set(missing)], "a link points at a page this app does not serve").toEqual([]);
  });

  it("can tell a real route from one that only looks like it", () => {
    // Without this, a matcher that accepted anything would pass the whole file.
    expect(isServed("/dues")).toBe(true);
    expect(isServed("/me")).toBe(true);
    expect(isServed("/me/finance")).toBe(false);
    expect(isServed("/events/00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isServed("/definitely-not-a-page")).toBe(false);
  });

  it("does not quietly skip a whole file", () => {
    // sourceFiles must actually reach the pages, not just the components.
    const files = new Set(destinations().map(({ file }) => file));
    expect([...files].some((file) => file.includes("app/(authenticated)"))).toBe(true);
    expect(existsSync("src/app/(authenticated)/dues/page.tsx")).toBe(true);
  });
});
