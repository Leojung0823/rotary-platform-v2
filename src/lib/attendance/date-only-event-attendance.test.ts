import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261015000200_date_only_attendance_settlement.sql",
  "utf8",
);
const eventMigration = readFileSync(
  "supabase/migrations/20261015000100_event_date_only_v1.sql",
  "utf8",
);
const verification = readFileSync("supabase/verification/event_date_only_security.sql", "utf8");
const presentation = readFileSync("src/lib/attendance/presentation.ts", "utf8");
const managementPage = readFileSync("src/app/(authenticated)/attendance/manage/page.tsx", "utf8");

describe("date-only meetings do not settle attendance at synthetic midnight", () => {
  it("shows an unsettled status and enters the denominator only after the date ends", () => {
    expect(migration).toContain("event.time_unspecified and event.ends_at > now() then 'pending'");
    expect(migration).toContain("then event.ends_at <= now()");
    expect(migration).toContain("else event.starts_at <= now()");
  });

  it("holds member and club history and summaries until the date boundary", () => {
    for (const name of [
      "public.list_my_attendance_history(uuid,date,date)",
      "public.get_my_attendance_summary(uuid,date,date)",
      "public.get_club_attendance_summary(uuid,date,date)",
    ]) {
      expect(migration, `${name} is not included in the cutoff patch`).toContain(name);
    }
    expect(migration.match(/then event\.ends_at <= now\(\)/gu)?.length).toBeGreaterThanOrEqual(2);
  });

  it("labels the in-progress roster row as pending and renders its date without a fake time", () => {
    expect(migration).toContain("'time_unspecified', event.time_unspecified");
    expect(presentation).toContain('pending: "待結算"');
    expect(managementPage).toContain("roster.event.time_unspecified");
    expect(managementPage).toContain("時間未定");
  });

  it("carries the date-only bit through the member-home upcoming-event CTE", () => {
    expect(eventMigration).toContain("event.time_unspecified,");
    expect(eventMigration).toContain("registration_deadline,\n      time_unspecified,\n      my_response");
    expect(eventMigration).toContain("'time_unspecified', item.time_unspecified");
  });

  it("prevents legacy updates from corrupting date-only boundary timestamps", () => {
    expect(eventMigration).toContain("club_events_time_unspecified_valid_boundaries_check");
    expect(eventMigration).toContain("registration_deadline is null");
    expect(eventMigration).toContain("(starts_at at time zone 'Asia/Taipei')::time = time '00:00'");
    expect(eventMigration).toContain("(ends_at at time zone 'Asia/Taipei')::date = (starts_at at time zone 'Asia/Taipei')::date + 1");
  });

  it("verifies both before and after the date ends against the local database", () => {
    expect(verification).toContain("before the local event date ended");
    expect(verification).toContain("after the local event date ended");
  });
});
