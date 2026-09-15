import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx$/u.test(entry)) out.push(path);
  }
  return out;
}

/**
 * Every `styles.<name>` / `styles["<name>"]` a component renders.
 *
 * A name built from a template literal (`styles[`taskIcon_${tone}`]`) cannot be
 * resolved here, so it is kept as its literal prefix and matched as a prefix
 * below: the whole family disappearing is the failure worth catching, and a
 * single missing tone is not knowable without running the component.
 */
function classesUsed(source: string): Set<string> {
  return new Set([
    ...[...source.matchAll(/\bstyles\.([A-Za-z_][A-Za-z0-9_]*)/gu)].map((match) => match[1]),
    ...[...source.matchAll(/\bstyles\[["'`]([^"'`]+)["'`]\]/gu)].map((match) => match[1]),
  ]);
}

/** True when the sheet has a rule for this name, or for the family it names. */
function isDefined(name: string, defined: Set<string>): boolean {
  if (!name.includes("${")) return defined.has(name);
  // `taskIcon_${tone}` and `${status}Badge` are both families; the literal half
  // is what identifies them.
  const prefix = name.slice(0, name.indexOf("${"));
  const suffix = name.slice(name.lastIndexOf("}") + 1);
  const literal = prefix.length >= suffix.length ? prefix : suffix;
  if (literal.length === 0) return false;
  return [...defined].some((candidate) => (literal === prefix
    ? candidate.startsWith(literal)
    : candidate.endsWith(literal)));
}

/**
 * Every class the sheet styles unconditionally -- selectors at the top level,
 * not the ones inside `@media`.
 *
 * The distinction is the whole point. `.motto2` survived its deletion because a
 * phone media query still said `display: none` for it, so "the sheet mentions
 * this class" was true while the element had no styling at any width it is
 * actually shown at. A class that exists only inside an at-rule is the exact
 * shape of that bug.
 *
 * Known limit: a class is counted as defined when it appears anywhere in a
 * top-level selector, so `.heroCover img { ... }` keeps `.heroCover` defined
 * even after its own rule is deleted. This asks whether the sheet styles the
 * class at all, not whether any particular declaration survived.
 */
function classesDefined(sheet: string): Set<string> {
  const text = readFileSync(sheet, "utf8").replace(/\/\*[\s\S]*?\*\//gu, "");
  const defined = new Set<string>();
  let depth = 0;
  let pending = "";
  for (const character of text) {
    if (character === "{") {
      if (depth === 0 && !pending.trimStart().startsWith("@")) {
        for (const match of pending.matchAll(/\.(-?[_a-zA-Z][\w-]*)/gu)) defined.add(match[1]);
      }
      depth += 1;
      pending = "";
    } else if (character === "}") {
      depth = Math.max(0, depth - 1);
      pending = "";
    } else {
      pending += character;
    }
  }
  return defined;
}

/** Components that import a CSS module, paired with the sheet they import. */
function pairs(): Array<{ component: string; sheet: string }> {
  const found: Array<{ component: string; sheet: string }> = [];
  for (const component of walk(resolve("src"))) {
    const source = readFileSync(component, "utf8");
    const imported = /import\s+styles\s+from\s+["'](\.[^"']+\.module\.css)["']/u.exec(source);
    if (!imported) continue;
    found.push({ component, sheet: resolve(dirname(component), imported[1]) });
  }
  return found;
}

/**
 * Classes whose only rule is inside a media query, deliberately: the element is
 * correct with the browser's own defaults at every other width, and the rule
 * exists only to take it away. Each entry is a decision, not an oversight.
 */
const mediaOnlyByDesign = new Set([
  // A nav label that is plain inline text on desktop and hidden on a phone,
  // where the icon and the short label below it carry the meaning.
  "role-aware-app-shell.module.css:desktopLabel",
]);

describe("every class a component renders has a rule", () => {
  // The dead-code sweep deleted `.motto2` as unused while member-portal.tsx
  // renders it. The three spans lost `display: grid` and ran together on one
  // line as "TOGETHERWE CREATEA BRIGHTER TOMORROW". Nothing failed: a missing
  // class is a valid, empty className, so typecheck, lint, build and the CSS
  // parse guard were all green. Leo spotted it in a screenshot.
  //
  // Asserting the two sides agree is the only thing that makes "unused" a
  // checkable claim rather than a judgement call made while deleting.
  it("defines every styles.* the components reference", () => {
    const missing: string[] = [];
    for (const { component, sheet } of pairs()) {
      const defined = classesDefined(sheet);
      for (const name of classesUsed(readFileSync(component, "utf8"))) {
        if (isDefined(name, defined)) continue;
        if (mediaOnlyByDesign.has(`${basename(sheet)}:${name}`)) continue;
        missing.push(`${basename(component)} renders .${name}, ${basename(sheet)} has no rule outside @media`);
      }
    }
    expect(missing, "a class with no rule is silently an empty className").toEqual([]);
  });

  it("checks a meaningful number of components", () => {
    // A broken import regex would make the guard above vacuously pass.
    expect(pairs().length).toBeGreaterThan(10);
  });

  it("keeps the exemption list honest", () => {
    // An exemption that no longer names anything real is a place for the next
    // missing class to hide.
    const used = new Set(pairs().flatMap(({ component, sheet }) => [...classesUsed(readFileSync(component, "utf8"))]
      .map((name) => `${basename(sheet)}:${name}`)));
    for (const exemption of mediaOnlyByDesign) {
      expect(used, `${exemption} is exempted but nothing renders it`).toContain(exemption);
    }
  });
});
