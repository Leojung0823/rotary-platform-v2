import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260920000200_event_cancellation_timeout_boundary.sql",
  "utf8",
);

describe("活動取消等待邊界", () => {
  it("bounds lock and trigger waits inside the cancellation transaction", () => {
    expect(migration).toContain("set local lock_timeout = '8s';");
    expect(migration).toContain("set local statement_timeout = '20s';");
    expect(migration).toContain("event_cancel_lock_timeout");
    expect(migration).toContain("event_cancel_statement_timeout");
  });

  it("preserves the RPC security boundary", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = pg_catalog, public, auth");
    expect(migration).toContain(
      "grant execute on function public.cancel_club_event(uuid, uuid, text) to authenticated",
    );
  });
});
