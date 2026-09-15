import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const globals = readFileSync("src/app/globals.css", "utf8");

function styleSheets(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return styleSheets(path);
    return entry.endsWith(".css") ? [path] : [];
  });
}

// The three places the floor does not apply: an "or" rule, a monospace token
// string, and a chevron glyph. None of them is prose a member has to read.
const microExemptions = [".divider", ".token-value", ".clubChevron"];

describe("design system floors", () => {
  it("keeps supporting text at or above 14px", () => {
    // UX_SENIOR_FRIENDLY_AUDIT_PLAN §4.1: body >= 16px, supporting text >= 14px,
    // and 10-12px only for brand micro-copy. The sheet used to break its own
    // rule in 50 places, with .hint and .subtle at 13px on 55 call sites.
    const offenders: string[] = [];
    for (const sheet of styleSheets("src")) {
      const text = readFileSync(sheet, "utf8");
      for (const line of text.split("\n")) {
        if (!/font-size:\s*1[0-3]px/u.test(line)) continue;
        if (microExemptions.some((selector) => line.includes(selector))) continue;
        offenders.push(`${sheet}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never sets a status badge below the floor", () => {
    // Colour may not be the only state indicator, which makes badge text
    // load-bearing rather than decoration.
    const badge = globals.slice(globals.indexOf(".badge {"));
    expect(badge.slice(0, badge.indexOf("}"))).toContain("var(--text-small)");
  });

  it("declares one type scale and one spacing scale", () => {
    for (const token of ["--text-display", "--text-title", "--text-body", "--text-small"]) {
      expect(globals).toContain(token);
    }
    for (const token of ["--space-2", "--space-4", "--space-5"]) {
      expect(globals).toContain(token);
    }
  });

  it("uses three weights rather than five", () => {
    // 850/800/760/700/650 all at once meant labels, buttons, numbers and
    // headings shouted together and nothing led.
    const weights = [...globals.matchAll(/font-weight:\s*(\d{3})\b/gu)].map((match) => match[1]);
    expect([...new Set(weights)].sort()).toEqual(["700", "900"]);
  });

  it("does not pull CJK headings together", () => {
    // Negative tracking is a Latin display technique; Chinese glyphs are fixed
    // blocks and their strokes collide.
    const heading = globals.slice(globals.indexOf("h1 {"), globals.indexOf("h2 {"));
    expect(heading).not.toMatch(/letter-spacing:\s*-/u);
  });

  it("separates a card by exactly one of border or shadow, never both", () => {
    // This guard used to pin the choice (hairline border, no lift), so flipping
    // the choice made it fail even though the rule it protects was intact. The
    // rule is the invariant, not the choice: a border says "here is an edge", a
    // shadow says "this is an object above the page", and doing both is what
    // made the surface read as a form. Either is defensible; both is not, and
    // neither leaves the card dissolving into the canvas.
    const card = globals.slice(globals.indexOf(".card {"));
    const rule = card.slice(0, card.indexOf("}"));
    expect(rule).toContain("var(--radius-card)");

    // Read the declarations rather than pattern-match the text: `border: 0`
    // still contains the substring "border:", and a lookahead placed after
    // \s* simply backtracks past the space and matches anyway.
    const declared = (property: string) => {
      const found = rule
        .split(";")
        .map((part) => part.split(":").map((half) => half.trim()))
        .find(([name]) => name === property);
      return found?.[1] ?? "";
    };
    const isNothing = (value: string) => value === "" || value === "0" || value === "none";
    const hasBorder = !isNothing(declared("border"));
    const hasShadow = !isNothing(declared("box-shadow"));
    expect(
      hasBorder !== hasShadow,
      `a card must use one separation mechanism, got border=${hasBorder} shadow=${hasShadow}`,
    ).toBe(true);
  });

  it("uses gold once per screen and never as text", () => {
    // #d5a92e on white is about 2.2:1, so it fails the moment it carries a
    // word. It is the club's own colour and appeared nowhere but the brand
    // mark, so it is spent on a single rule above the page title.
    expect(globals).toContain(".page-header h1::before");
    expect(globals).not.toMatch(/color: var\(--gold\)/u);
  });

  it("separates the blue that fills from the blue that is read", () => {
    // --blue is 4.58:1 on pure white: it clears AA only just, and it does not
    // clear it at all on the surfaces it is actually drawn on -- 4.28:1 on the
    // translucent mobile bar, 4.14:1 on --blue-soft. So --blue fills and
    // --blue-ink is read, and the two must not be swapped by habit.
    expect(globals).toContain("--blue-ink:");

    const offenders: string[] = [];
    for (const sheet of styleSheets("src")) {
      for (const line of readFileSync(sheet, "utf8").split("\n")) {
        if (/color:\s*var\(--blue\)/u.test(line) && !/-color:/u.test(line)) {
          offenders.push(`${sheet}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, "--blue is a fill; text takes --blue-ink").toEqual([]);
  });

  it("never reads a custom property nothing defines", () => {
    // An unresolved var() does not fall back -- it invalidates the whole
    // declaration. `outline: 2px solid var(--accent)` with no --accent anywhere
    // meant the notification links simply had no visible focus ring, which is
    // invisible in review and invisible in a screenshot.
    const sheets = styleSheets("src");
    const defined = new Set<string>();
    for (const sheet of sheets) {
      for (const match of readFileSync(sheet, "utf8").matchAll(/(--[a-z0-9-]+)\s*:/gu)) {
        defined.add(match[1]);
      }
    }

    const dangling: string[] = [];
    for (const sheet of sheets) {
      for (const line of readFileSync(sheet, "utf8").split("\n")) {
        for (const match of line.matchAll(/var\((--[a-z0-9-]+)\s*(,?)/gu)) {
          // A declared fallback is a deliberate default, not a dangling read.
          if (match[2] === "," || defined.has(match[1])) continue;
          dangling.push(`${sheet}: ${match[1]}`);
        }
      }
    }
    // Properties set from TSX style props are the one legitimate exception.
    const setInMarkup = ["--nav-count", "--bar-width"];
    expect(dangling.filter((entry) => !setInMarkup.some((name) => entry.endsWith(name)))).toEqual([]);
  });

  it("never places a grid child by counting the rows its siblings occupy", () => {
    // `grid-row: 1 / span 3` was written when a card had three children. Adding
    // one to the markup left the span pointing at the wrong place, so the
    // desktop layout came apart while every test stayed green -- the rule is
    // valid CSS, it just no longer describes the markup. Placing children by
    // name survives a change to the markup; counting them does not.
    const offenders: string[] = [];
    for (const sheet of styleSheets("src")) {
      for (const line of readFileSync(sheet, "utf8").split("\n")) {
        if (/grid-(row|column):[^;]*\bspan\s+\d/u.test(line)) offenders.push(`${sheet}: ${line.trim()}`);
      }
    }
    expect(offenders, "place grid children by name, not by counting siblings").toEqual([]);
  });

  it("keeps build and environment labels out of the brand", () => {
    // Asked for twice: once in the desktop spec, once directly. "ROTARY V2" is
    // an internal version name and "STAGING" is a deployment detail; neither is
    // something a club member has any use for, and both sat on the brand where
    // they read as part of the product's name.
    for (const shell of ["src/components/role-aware-app-shell.tsx", "src/components/app-shell.tsx", "src/components/app-shell-loading.tsx"]) {
      const source = readFileSync(shell, "utf8");
      expect(source, `${shell} still shows a build label`).not.toContain("ROTARY V2");
      expect(source, `${shell} still shows an environment label`).not.toMatch(/environmentLabel/u);
    }
  });
});
