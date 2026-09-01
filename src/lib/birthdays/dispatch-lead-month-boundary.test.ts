import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

describe("birthday collection dispatch lead time", () => {
  const migration = source("supabase/migrations/20260901000200_birthday_collection_dispatch_lead_month.sql");
  const verification = source("supabase/verification/birthday_collection_manager_permissions_security.sql");
  const schedulerVerification = source("supabase/verification/birthday_wish_collection_scheduler_security.sql");

  it("dispatches next month rather than the month in progress", () => {
    // A member born on the 1st previously received the invitation on their
    // birthday, because the first daily run of that month created the batch.
    expect(migration).toContain("(date_trunc('month', clock.local_today) + interval '1 month')::date");
    expect(migration).toContain("(date_trunc('month', clock.local_today) + interval '2 months')::date");
    expect(migration).not.toContain(">= date_trunc('month', clock.local_today)::date");
    expect(migration).not.toContain("clock.local_today + 7");
  });

  it("reads the month boundary in the club's own timezone", () => {
    expect(migration).toContain("(p_as_of at time zone club_row.timezone_name)::date as local_today");
  });

  it("can still reach January when dispatching from December", () => {
    // Shifting a whole month forward crosses the year end, so the second
    // birthday_effective_date row is load-bearing again.
    expect(migration).toContain("extract(year from clock.local_today)::integer + 1");
  });

  it("keeps one batch per birthday month, so the monthly quota is untouched", () => {
    // Grouping is still by birthday year and month, which is what the
    // one-invitation-per-member-per-birthday-month idempotency key rests on.
    expect(migration).toContain("extract(year from birthday.birthday_date)::integer as birthday_year");
    expect(migration).toContain("extract(month from birthday.birthday_date)::integer as birthday_month");
  });

  it("carries the manager selection fixed in the previous migration", () => {
    expect(migration).toContain("assignment.role_key in ('president', 'secretary')");
    expect(migration).toContain("order by candidate.manager_priority");
    expect(migration).toContain("'no_active_birthday_manager', skipped_no_manager_count");
    expect(migration).not.toContain("public.current_can_manage_club(");
  });

  it("has verification whose as_of sits a month before the birthday", () => {
    expect(verification).toContain("timestamptz '2026-08-01 00:00:00+00'");
    expect(verification).toContain("batch.birthday_month = 9");
    expect(schedulerVerification).toContain("timestamptz '2026-07-01 00:00:00+00'");
    expect(schedulerVerification).not.toContain("timestamptz '2026-09-01 00:00:00+00'");
  });
});
