import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const guard = "scripts/check-migration-history.sh";
const script = readFileSync(guard, "utf8");

function runGuard(env: Record<string, string> = {}) {
  try {
    return {
      code: 0,
      output: execFileSync("bash", [guard], { encoding: "utf8", env: { ...process.env, ...env } }),
    };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return { code: failure.status ?? 1, output: failure.stdout ?? "" };
  }
}

describe("migration history guard", () => {
  it("refuses two migrations that claim the same version", () => {
    // Supabase keys schema_migrations on the version alone, so a shared number
    // means the second file dies on a duplicate primary key mid-release and
    // leaves the database half-migrated. That happened on 2026-09-14 because
    // nothing checked for it.
    //
    // The pair is built in a directory of its own. This used to copy the
    // fixture into supabase/migrations and delete it again -- and vitest runs
    // test files in parallel, so any other guard enumerating that directory
    // could list the fixture and then fail to open it. It showed up as an
    // intermittent ENOENT in whichever unrelated test was reading migrations at
    // that moment, three times in one afternoon, each time looking like a
    // mystery somewhere else.
    const directory = mkdtempSync(join(tmpdir(), "migration-collision-"));
    try {
      copyFileSync(
        "supabase/migrations/20260914000400_dues_finance_v1_core.sql",
        join(directory, "20260914000400_dues_finance_v1_core.sql"),
      );
      copyFileSync(
        "supabase/migrations/20260914000900_event_venue_geocode_gate.sql",
        join(directory, "20260914000400_guard_collision_fixture.sql"),
      );
      const { code, output } = runGuard({ MIGRATION_COLLISION_DIR: directory });
      expect(code).toBe(1);
      expect(output).toContain("Two migrations cannot share a version number");
      expect(output).toContain("20260914000400_dues_finance_v1_core.sql");
      expect(output).toContain("20260914000400_guard_collision_fixture.sql");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("writes nothing into the real migrations directory", () => {
    // The point of the change above: this suite has to be able to run alongside
    // anything else that reads this directory. Asserted against this file's own
    // text, because "it cleans up afterwards" is exactly what the old version
    // did -- and the window between creating and removing was the whole bug.
    const self = readFileSync("src/lib/migration-collision-guard.test.ts", "utf8");
    const destinations = [...self.matchAll(/copyFileSync\(\s*"[^"]*",\s*([^)]+)\)/gu)]
      .map((match) => match[1].trim());
    expect(destinations.length, "nothing is copied at all; this guard is checking nothing")
      .toBeGreaterThan(0);
    for (const destination of destinations) {
      expect(destination, "a fixture is written straight into the real migrations tree")
        .toContain("directory");
    }
    const stray = readdirSync("supabase/migrations")
      .filter((name) => name.includes("guard_collision_fixture"));
    expect(stray, "a fixture migration was left behind in the real tree").toEqual([]);
  });

  it("passes on a tree with no colliding versions", () => {
    expect(runGuard().code).toBe(0);
  });

  it("still refuses editing or deleting a migration already on the base branch", () => {
    expect(script).toContain("Historical migrations must not be modified, renamed, or deleted");
  });

  it("allows a renumber only when it is byte-identical and escapes a live collision", () => {
    // Renaming is how a collision gets fixed, so it cannot be banned outright --
    // but it must not become a way to rewrite a migration that is already
    // applied somewhere.
    expect(script).toContain('"$status" == "R100"');
    expect(script).toContain("still_claimed");
  });

  it("keeps the history checks pointed at the real tree", () => {
    // Only the collision scan is overridable. If the git-history checks took
    // the override too, this suite would be proving them against a temp
    // directory that has no history at all.
    const overrides = script.match(/MIGRATION_COLLISION_DIR/gu) ?? [];
    expect(overrides.length, "the override is read in more than one place").toBe(1);
    expect(script).toContain('git diff --name-status');
  });
});
