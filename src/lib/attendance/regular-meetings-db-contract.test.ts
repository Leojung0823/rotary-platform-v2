import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260824000200_attendance_regular_meetings_only.sql",
  ),
  "utf8",
);
const domainCore = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260811000100_attendance_domain_core.sql"),
  "utf8",
);
const pageProjections = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821000100_attendance_page_projections.sql"),
  "utf8",
);

const canonicalSources = {
  attendance_result_for_member: domainCore,
  list_my_attendance_history: domainCore,
  get_my_attendance_summary: domainCore,
  get_event_attendance_roster: domainCore,
  set_attendance_adjustment: domainCore,
  get_club_attendance_summary: domainCore,
  export_event_attendance_csv: domainCore,
  list_club_attendance_events: pageProjections,
} as const;

function extractFunction(source: string, name: string): string {
  const marker = `create or replace function public.${name}(`;
  const start = source.indexOf(marker);
  expect(start, `${name} is missing`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n$$;", start);
  expect(end, `${name} has no terminator`).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}

function removeRegularMeetingGuards(functionSql: string): string {
  return functionSql
    .replace(
      "      event.event_type = 'regular_meeting'\n      and event.event_status",
      "      event.event_status",
    )
    .replaceAll("\n      and event.event_type = 'regular_meeting'", "")
    .replaceAll(" and event.event_type = 'regular_meeting'", "")
    .replaceAll(" and event_type = 'regular_meeting'", "");
}

describe("Attendance regular-meeting database contract", () => {
  it("rebuilds only the eight canonical Attendance functions", () => {
    const rebuiltFunctions = [...migration.matchAll(/create or replace function public\.([a-z_]+)\(/gu)]
      .map((match) => match[1]);

    expect(rebuiltFunctions).toEqual(Object.keys(canonicalSources));
    expect(migration).not.toMatch(/\bcreate\s+(?:table|type|view|trigger|policy)\b/iu);
    expect(migration).not.toMatch(/\balter\s+table\b/iu);
  });

  it.each(Object.entries(canonicalSources))(
    "%s differs from canonical only by its regular-meeting guard",
    (name, canonicalSource) => {
      const rebuilt = extractFunction(migration, name);

      expect(rebuilt).toContain("regular_meeting");
      expect(rebuilt).toMatch(/security definer\nset search_path = pg_catalog, public(?:, auth)?/u);
      expect(removeRegularMeetingGuards(rebuilt)).toBe(extractFunction(canonicalSource, name));
    },
  );
});
