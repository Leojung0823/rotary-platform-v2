import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = "supabase/migrations";
const verifications = "supabase/verification";

/**
 * Parenthesis depth of a chunk of SQL, ignoring string literals and comments.
 *
 * A migration is a string until Postgres parses it, so an unbalanced paren
 * costs a full CI round trip to discover -- `syntax error at or near ")"`,
 * with no file named. This is the SQL half of the CSS brace-balance guard,
 * written after a restatement kept the tail of the expression it replaced.
 */
export function parenDepth(sql: string): number | "unbalanced" {
  let depth = 0;
  let index = 0;
  let inString = false;
  while (index < sql.length) {
    const rest = sql.slice(index, index + 2);
    if (inString) {
      if (sql[index] === "'") {
        // '' inside a literal is an escaped quote, not the end of it.
        if (sql[index + 1] === "'") { index += 2; continue; }
        inString = false;
      }
    } else if (sql[index] === "'") {
      inString = true;
    } else if (rest === "--") {
      const newline = sql.indexOf("\n", index);
      index = newline === -1 ? sql.length : newline;
      continue;
    } else if (sql[index] === "(") {
      depth += 1;
    } else if (sql[index] === ")") {
      depth -= 1;
      if (depth < 0) return "unbalanced";
    }
    index += 1;
  }
  return depth;
}

/**
 * Every function body in a file: the SQL between the opening `$$` and `$$;`.
 *
 * The body and not the whole declaration, because the first version of this
 * started at the `create` line and treated `$$` as a region to skip -- which
 * is the entire body. It checked nothing, and stayed green with the defect it
 * was written for put back.
 */
function functionBodies(sql: string): { name: string; body: string }[] {
  const bodies: { name: string; body: string }[] = [];
  const pattern = /create (?:or replace )?function public\.([a-z0-9_]+)\(/gu;
  for (const match of sql.matchAll(pattern)) {
    const opening = sql.indexOf("$$", match.index ?? 0);
    const end = sql.indexOf("\n$$;", opening === -1 ? (match.index ?? 0) : opening);
    if (opening === -1 || end === -1) continue;
    bodies.push({ name: match[1], body: sql.slice(opening + 2, end) });
  }
  return bodies;
}

function sqlFiles(directory: string): string[] {
  return readdirSync(directory).filter((name) => name.endsWith(".sql")).map((name) => join(directory, name));
}

describe("every SQL function body balances its parentheses", () => {
  // The failure this catches reaches CI as `syntax error at or near ")"` with
  // no file and no line, after a full database reset.
  it("finds no unbalanced function in any migration", () => {
    const offenders: string[] = [];
    for (const file of sqlFiles(migrations)) {
      for (const { name, body } of functionBodies(readFileSync(file, "utf8"))) {
        const depth = parenDepth(body);
        if (depth !== 0) offenders.push(`${file}: public.${name} → ${depth}`);
      }
    }
    expect(offenders, "an unbalanced function body").toEqual([]);
  });

  it("finds no unbalanced verification file", () => {
    const offenders = sqlFiles(verifications)
      .filter((file) => parenDepth(readFileSync(file, "utf8")) !== 0);
    expect(offenders).toEqual([]);
  });

  it("checks a meaningful number of functions", () => {
    // A broken pattern would make both tests above vacuously pass.
    const total = sqlFiles(migrations)
      .reduce((count, file) => count + functionBodies(readFileSync(file, "utf8")).length, 0);
    expect(total).toBeGreaterThan(100);
  });

  it("reads inside the dollar quotes, not around them", () => {
    // The first version skipped everything between $$ and $$, which is the
    // body. Anchoring this on a real function keeps that from coming back.
    const found = functionBodies(
      readFileSync(join(migrations, "20260916000900_member_home_pending_task_kinds.sql"), "utf8"),
    );
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe("get_my_member_home_projection");
    expect(found[0].body, "the body is empty, so nothing is being checked")
      .toContain("'pending_tasks'");
    expect(found[0].body).not.toContain("create or replace function");
  });

  it("notices the shapes it is meant to notice", () => {
    expect(parenDepth("select f((a)")).toBe(1);
    expect(parenDepth("select f(a))")).toBe("unbalanced");
    // Parens inside a literal or a comment are text, not structure.
    expect(parenDepth("select ')('")).toBe(0);
    expect(parenDepth("select 1 -- )(\n")).toBe(0);
    expect(parenDepth("select 'it''s ('")).toBe(0);
  });
});
