import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const baseProjection = latestDefinition("get_my_member_home_projection");
const migration = readFileSync(
  "supabase/migrations/20261027000600_member_home_declined_event_status.sql",
  "utf8",
);

describe("upcoming events preserve an explicit declined response", () => {
  it("patches the current upcoming-status block without re-declaring the projection", () => {
    const oldCase = `when item.my_response = 'attending' then 'registered'
            when public.event_registration_is_open(item.registration_deadline, item.starts_at, item.ends_at) then 'open'
            else 'closed'
          end`;

    expect(baseProjection).toContain(oldCase);
    expect(migration).toContain("pg_get_functiondef(");
    expect(migration).toContain("occurrences <> 1");
    expect(migration).toContain("when item.my_response = 'declined' then 'declined'");
    expect(migration).toContain(oldCase);
  });
});
