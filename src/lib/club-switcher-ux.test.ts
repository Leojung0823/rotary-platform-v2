import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const shell = source("src/components/role-aware-app-shell.tsx");
const css = source("src/components/role-aware-app-shell.module.css");

describe("club switcher wording", () => {
  it("does not put the model's word in front of a member", () => {
    // "作用社別" is how the projection names it. A member reading their own
    // phone has no way to know that means "the club you are looking at".
    for (const path of [
      "src/components/role-aware-app-shell.tsx",
      "src/components/experience-context-resolver.tsx",
      "src/components/role-aware-dashboard.tsx",
    ]) {
      const rendered = source(path)
        // Comments may still explain the old term.
        .replace(/\{\/\*[\s\S]*?\*\/\}/gu, "")
        .replace(/\/\/[^\n]*/gu, "")
        .replace(/\/\*[\s\S]*?\*\//gu, "");
      expect(rendered).not.toContain("作用社別");
    }
  });

  it("names the control in words a member uses", () => {
    expect(shell).toContain("目前所在的社／委員會");
  });
});

describe("club switcher affordance", () => {
  it("shows something that says the box can be opened", () => {
    expect(shell).toContain("clubChevron");
    expect(css).toContain(".clubSwitcher[open] .clubChevron");
  });

  it("opens next to the control on a phone, not pinned to the bottom", () => {
    const mobile = css.slice(css.indexOf("@media (max-width: 840px)"));
    const panel = mobile.slice(mobile.indexOf(".clubPanel {"), mobile.indexOf(".clubPanel {") + 240);
    // A sheet at the bottom of the screen reads as unrelated to the box at the
    // top that was tapped.
    expect(panel).toContain("position: absolute");
    expect(panel).toContain("top: calc(100% + 8px)");
    expect(panel).not.toContain("position: fixed");
  });

  it("keeps the panel anchored to a positioned trigger", () => {
    // Without this the absolute panel would escape to the page corner.
    expect(css).toMatch(/\.clubSwitcher \{[^}]*position: relative/u);
  });
});
