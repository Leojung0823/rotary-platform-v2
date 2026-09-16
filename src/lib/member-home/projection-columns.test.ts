import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

/** The projection with its SQL comments removed. */
function sql(): string {
  return latestDefinition("get_my_member_home_projection")
    .split("\n")
    .map((line) => line.replace(/--.*$/u, ""))
    .join("\n");
}

/** The columns a `select ... from` list provides, by their output name. */
function selectedNames(selectList: string): Set<string> {
  return new Set(selectList
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const aliased = /\bas\s+([a-z_]+)$/iu.exec(entry);
      if (aliased) return aliased[1];
      const bare = /([a-z_]+)$/u.exec(entry);
      return bare ? bare[1] : "";
    })
    .filter((name) => name.length > 0));
}

/** Every `alias.column` used anywhere in the function. */
function referenced(alias: string): Set<string> {
  return new Set([...sql().matchAll(new RegExp(`\\b${alias}\\.([a-z_]+)`, "gu"))].map((m) => m[1]));
}

describe("every qualified column the projection reads is one it selected", () => {
  // `item.ends_at` was asked for by a CTE that did not select it. Nothing local
  // could see it: the SQL is a string until Postgres parses it, so the first
  // thing to notice was CI running the migration -- twice in a row, because the
  // same omission was in two CTEs and the first error hid the second.
  it("upcoming_list provides everything item.* reads", () => {
    const body = sql();
    const cte = body.slice(body.indexOf("), upcoming_list as ("), body.indexOf("), presented_events as ("));
    const provided = selectedNames(cte.slice(cte.indexOf("select") + 6, cte.indexOf("from ranked_events")));
    for (const column of referenced("item")) {
      expect(provided, `upcoming_list does not select ${column}`).toContain(column);
    }
  });

  it("the pending-task subquery provides everything task.* reads", () => {
    const body = sql();
    const found = /from \(select ([^)]+)\) as task/u.exec(body);
    expect(found, "the pending-task subquery is gone").not.toBeNull();
    const provided = selectedNames(found![1].split(" from ")[0]);
    for (const column of referenced("task")) {
      expect(provided, `the pending-task subquery does not select ${column}`).toContain(column);
    }
  });

  it("checks something", () => {
    // A regex that matched nothing would make both tests above vacuous. Named
    // columns rather than a count: the count changed when the projection
    // stopped selecting two columns it no longer used, which says nothing
    // about whether this guard still works.
    expect(referenced("item")).toContain("ends_at");
    expect(referenced("item")).toContain("registration_deadline");
    expect(referenced("task")).toContain("ends_at");
    expect(referenced("task")).toContain("registration_deadline");
  });
});
