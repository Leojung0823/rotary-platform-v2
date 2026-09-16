import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrations = "supabase/migrations";

/**
 * The migration filenames in the order Postgres applies them.
 *
 * Only the last `create or replace` for a function describes what the database
 * actually runs. A test that reads the migration that introduced a function is
 * asserting about a definition that may have been replaced three times since,
 * and it stays green while the live function drifts away from it.
 */
export function migrationFilenames(): string[] {
  return readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort();
}

/**
 * Both spellings a migration can use to define a function.
 *
 * A few functions are re-declared with a plain `create function` after a
 * `drop function`, because their signature changed. Matching only
 * `create or replace` read the older definition of those and called it current
 * -- which is how a restatement of get_club_affairs_page came within one merge
 * of reverting the version that superseded it.
 */
function definitionMarkers(name: string): readonly string[] {
  return [
    `create or replace function public.${name}(`,
    `create function public.${name}(`,
  ];
}

/** The migration that last defines `name`, or null when nothing defines it. */
export function migrationDefining(name: string): string | null {
  const markers = definitionMarkers(name);
  const found = migrationFilenames().filter((file) => {
    const text = readFileSync(join(migrations, file), "utf8");
    return markers.some((marker) => text.includes(marker));
  });
  return found.length === 0 ? null : found[found.length - 1];
}

/** The body of the last `create or replace` of `name`, up to its closing `$$;`. */
export function latestDefinition(name: string): string {
  const file = migrationDefining(name);
  if (file === null) throw new Error(`no migration defines public.${name}`);
  const text = readFileSync(join(migrations, file), "utf8");
  const start = Math.max(...definitionMarkers(name).map((marker) => text.lastIndexOf(marker)));
  if (start === -1) throw new Error(`public.${name} is not defined in ${file}`);
  const end = text.indexOf("\n$$;", start);
  if (end === -1) throw new Error(`public.${name} in ${file} has no closing $$;`);
  return text.slice(start, end);
}

/** Every function name any migration defines. */
export function definedFunctionNames(): readonly string[] {
  const names = new Set<string>();
  for (const file of migrationFilenames()) {
    const text = readFileSync(join(migrations, file), "utf8");
    for (const match of text.matchAll(/create or replace function public\.([a-z0-9_]+)\(/gu)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}
