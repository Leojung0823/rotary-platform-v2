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

  it("gives a card an edge rather than a shadow", () => {
    const card = globals.slice(globals.indexOf(".card {"));
    const rule = card.slice(0, card.indexOf("}"));
    expect(rule).toContain("border: 1px solid var(--line)");
    expect(rule).not.toContain("box-shadow: 0");
  });
});
