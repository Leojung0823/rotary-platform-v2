import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrationDefining, migrationFilenames } from "@/lib/attendance/latest-definition";

const migrations = "supabase/migrations";

/**
 * A migration that fixes a function by rewriting the text Postgres itself
 * holds, rather than by re-declaring it.
 *
 * These are invisible to every file in this repository: the corrected
 * definition appears in no `create or replace`. Restating such a function from
 * the migration files therefore reintroduces the bug it fixed, with every gate
 * green -- which is how one of them came within a merge of going back out.
 */
type Repair = { file: string; target: string; before: string; after: string };

function repairs(): Repair[] {
  const found: Repair[] = [];
  for (const file of migrationFilenames()) {
    const text = readFileSync(join(migrations, file), "utf8");
    if (!text.includes("pg_get_functiondef") && !text.includes("to_regprocedure")) continue;
    const target = /'public\.(\w+)\([^)]*\)'/u.exec(text)?.[1];
    expect(target, `${file} repairs a function in place but names none`).toBeTruthy();
    // Both spellings this repository has used: a plain quoted string, and a
    // dollar-quoted block for text that itself contains quotes.
    const pairs = [
      /old_declaration text := '([\s\S]+?)';[\s\S]*?corrected_declaration text := '([\s\S]+?)';/u,
      /old_\w+ constant text := \$replace\$([\s\S]+?)\$replace\$;[\s\S]*?new_\w+ constant text := \$replace\$([\s\S]+?)\$replace\$;/u,
    ];
    const matched = pairs.map((pattern) => pattern.exec(text)).find((result) => result !== null);
    expect(matched, `${file} repairs ${target} in place in a shape this guard cannot read`).toBeTruthy();
    found.push({ file, target: target as string, before: matched![1], after: matched![2] });
  }
  return found;
}

describe("就地修補過的函式，不准被下一次重述悄悄改回去", () => {
  // The rule existed, hardcoded to one migration -- down to that migration's
  // own variable names. The next repair used different names and was covered by
  // nothing. A rule applied to one instance is not a rule; the same shape put
  // min-width: 0 on a single card while every other card kept the bug.

  it("finds the repairs there are", () => {
    const found = repairs();
    expect(found.length, "no in-place repairs found; this guard is checking nothing")
      .toBeGreaterThan(1);
    expect(found.map((repair) => repair.target)).toContain("get_club_affairs_page");
  });

  it("carries every repair forward through any later restatement", () => {
    const reverted: string[] = [];
    for (const repair of repairs()) {
      const declaring = migrationDefining(repair.target);
      expect(declaring, `nothing declares ${repair.target}`).not.toBeNull();
      // A declaration older than the repair is fine: the repair is what runs.
      // A declaration newer than it replaced the repaired text outright, so it
      // has to contain the correction itself.
      if ((declaring as string) < repair.file) continue;
      const declared = readFileSync(join(migrations, declaring as string), "utf8");
      if (!declared.includes(repair.after)) {
        reverted.push(`${declaring} restates ${repair.target} without ${repair.file}'s fix`);
      }
      if (declared.includes(repair.before)) {
        reverted.push(`${declaring} brought back the text ${repair.file} repaired`);
      }
    }
    expect(reverted, "a restatement silently undid an in-place repair").toEqual([]);
  });

  it("reads the repair's own before and after rather than a copy kept here", () => {
    // A guard holding its own copy of the corrected text stops being about the
    // repair the moment the repair changes. The forbidden text is derived from
    // the repairs themselves, so this cannot be written as a literal that then
    // matches itself -- which is what the first version of this did.
    const code = readFileSync("src/lib/in-place-repairs.test.ts", "utf8");
    for (const repair of repairs()) {
      const opening = repair.after.trim().split(/\s+/u).slice(0, 5).join(" ");
      expect(opening.length, "the repair has no text to compare").toBeGreaterThan(10);
      expect(code, `${repair.file}'s corrected text is pasted into this file`)
        .not.toContain(opening);
    }
  });

  it("notices a repair written in a shape it cannot read", () => {
    // The failure this replaces was not a wrong answer, it was no answer: the
    // second repair simply was not looked at. Every repair must parse.
    for (const repair of repairs()) {
      expect(repair.before.length, `${repair.file}: empty before-text`).toBeGreaterThan(10);
      expect(repair.after.length, `${repair.file}: empty after-text`).toBeGreaterThan(10);
      expect(repair.after, `${repair.file}: the repair changes nothing`).not.toBe(repair.before);
    }
  });
});
