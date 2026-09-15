import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("src/components/role-aware-app-shell.module.css", "utf8");

/**
 * The phone block. The same selectors exist for the desktop rail, and reading
 * the file as a whole matched those instead -- the first draft of this guard
 * failed against correct CSS for that reason.
 */
const phone = (() => {
  const start = shell.indexOf("@media (max-width: 840px) {");
  expect(start, "the phone block is gone").toBeGreaterThan(-1);
  const next = shell.indexOf("@media", start + 10);
  return shell.slice(start, next === -1 ? undefined : next);
})();

/** The declaration inside a named rule, so a match elsewhere cannot stand in. */
function declaration(selector: string, property: string, scope: string = shell): string {
  const rule = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "u").exec(scope);
  expect(rule, `${selector} has no rule`).not.toBeNull();
  const found = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`, "u").exec(rule![1]);
  expect(found, `${selector} does not set ${property}`).not.toBeNull();
  return found![1].trim();
}

describe("the account avatar and the row it sits over", () => {
  // On a phone the avatar is pinned over the brand row rather than laid out in
  // it. The row is 30px of brand mark and the avatar is 40px, so it hung 10px
  // below and sat on the club switcher underneath -- twice, because the first
  // fix moved the number instead of removing the coincidence.
  it("reserves the avatar's own height on the row it is pinned over", () => {
    expect(declaration("\\.avatar", "height")).toBe("var(--shell-avatar)");
    expect(declaration("\\.avatar", "width")).toBe("var(--shell-avatar)");
    expect(declaration("\\.brand", "min-height", phone)).toBe("var(--shell-avatar)");
  });

  it("reserves the avatar's own width in the gutter beside it", () => {
    // A hard-coded 44px gutter beside a 40px avatar is right only by accident.
    // Reserved once on the row, rather than separately on each thing sharing
    // it -- two copies of the same number is how they drift.
    expect(declaration("\\.header", "padding-right", phone)).toContain("var(--shell-avatar)");
  });

  it("declares that size once", () => {
    expect(shell.match(/--shell-avatar:/gu)?.length).toBe(1);
  });
});
