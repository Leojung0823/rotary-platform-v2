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

/** The migration that last defines `name`, or null when nothing defines it. */
export function migrationDefining(name: string): string | null {
  const needle = `create or replace function public.${name}(`;
  const found = migrationFilenames().filter((file) => readFileSync(join(migrations, file), "utf8").includes(needle));
  return found.length === 0 ? null : found[found.length - 1];
}

/** The body of the last `create or replace` of `name`, up to its closing `$$;`. */
export function latestDefinition(name: string): string {
  const file = migrationDefining(name);
  if (file === null) throw new Error(`no migration defines public.${name}`);
  const text = readFileSync(join(migrations, file), "utf8");
  const needle = `create or replace function public.${name}(`;
  const start = text.lastIndexOf(needle);
  const end = text.indexOf("\n$$;", start);
  if (end === -1) throw new Error(`public.${name} in ${file} has no closing $$;`);
  return text.slice(start, end);
}
