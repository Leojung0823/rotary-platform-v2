import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

const guard = "scripts/check-migration-history.sh";
const script = readFileSync(guard, "utf8");
const collisionFixture = "supabase/migrations/20260914000400_guard_collision_fixture.sql";

function runGuard() {
  try {
    return { code: 0, output: execFileSync("bash", [guard], { encoding: "utf8" }) };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return { code: failure.status ?? 1, output: failure.stdout ?? "" };
  }
}

afterEach(() => {
  rmSync(collisionFixture, { force: true });
});

describe("migration history guard", () => {
  it("refuses two migrations that claim the same version", () => {
    // Supabase keys schema_migrations on the version alone, so a shared number
    // means the second file dies on a duplicate primary key mid-release and
    // leaves the database half-migrated. That happened on 2026-09-14 because
    // nothing checked for it.
    copyFileSync("supabase/migrations/20260914000900_event_venue_geocode_gate.sql", collisionFixture);
    const { code, output } = runGuard();
    expect(code).toBe(1);
    expect(output).toContain("Two migrations cannot share a version number");
    expect(output).toContain("20260914000400_dues_finance_v1_core.sql");
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
});
