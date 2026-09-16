import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

/** The declarations of a top-level rule, ignoring comments. */
function ruleBody(selector: string): string {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//gu, "");
  const at = stripped.search(new RegExp(`^\\${selector}\\s*\\{`, "mu"));
  expect(at, `${selector} has no top-level rule`).toBeGreaterThan(-1);
  return stripped.slice(at, stripped.indexOf("}", at));
}

describe("一張裝了表格的卡片，不該把手機頁面撐寬", () => {
  // .page-stack is a grid. A grid item will not shrink below its content's
  // min-content width unless it is told to, so a card holding a .table-wrap
  // grows to the table's natural width and takes the page with it -- while the
  // scroller inside it never gets the chance to scroll.
  //
  // It was patched once, on .identity-ledger-card alone. Every other card kept
  // the bug, including the 社員 page's tags table: a club with a tag whose name
  // and description are long enough scrolls sideways on a phone. It surfaced as
  // an intermittent browser failure, because the widest tag in the fixture club
  // is created and archived by a different test file running in parallel.

  it("gives every card the rule, not one card that was noticed", () => {
    expect(ruleBody(".card"), ".card can still be widened by what it holds")
      .toMatch(/min-width:\s*0/u);
  });

  it("keeps the scroller that the card now lets shrink", () => {
    // min-width: 0 only helps because the table has somewhere to scroll.
    expect(ruleBody(".table-wrap")).toMatch(/overflow-x:\s*auto/u);
  });

  it("leaves no per-instance copy of the same rule behind", () => {
    // A second rule saying the same thing for one card is where the next
    // person looks to fix the next page, instead of fixing the class.
    expect(css, "the per-card patch is still there").not.toContain("identity-ledger-card {");
  });

  it("is checking a real stylesheet", () => {
    expect(css.length).toBeGreaterThan(5000);
    expect(css).toContain(".page-stack { display: grid");
  });
});
