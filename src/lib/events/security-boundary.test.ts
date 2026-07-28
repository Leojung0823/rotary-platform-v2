import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("event application boundary", () => {
  const page = source("app/(authenticated)/events/page.tsx");
  const actions = source("app/event-actions.ts");
  const shell = source("components/app-shell.tsx");

  it("exposes the events entrypoint on desktop and mobile navigation", () => {
    expect(shell.match(/href="\/events"/gu)).toHaveLength(2);
  });

  it("renders event text through React and does not expose raw database errors", () => {
    expect(page).toContain("{event.title}");
    expect(page).toContain("{event.description}");
    expect(page).not.toContain("dangerouslySetInnerHTML");
    expect(actions).toContain("mapEventError(error.message)");
    expect(actions).toContain('return "unexpected"');
    expect(actions).not.toContain("redirect(error.message");
    expect(actions).not.toContain("code: error.message");
  });

  it("keeps event authorization self-contained and uses RPC-only mutations", () => {
    expect(page).toContain('rpc("list_my_event_clubs")');
    expect(page).toContain("selectedClub.can_register");
    expect(page).not.toContain("list_my_board_clubs");
    for (const rpc of [
      "create_club_event",
      "publish_club_event",
      "cancel_club_event",
      "set_my_event_registration",
    ]) {
      expect(actions).toContain(`rpc(\"${rpc}\"`);
    }
    expect(actions).not.toContain('.from("club_events")');
    expect(actions).not.toContain('.from("event_registrations")');
  });
});

describe("event database boundary", () => {
  const migration = source("../supabase/migrations/20260729000100_event_registration_mvp.sql");
  const integrity = source("../supabase/migrations/20260729000110_event_registration_tenant_integrity.sql");
  const access = source("../supabase/migrations/20260729000120_event_access_projection.sql");

  it("denies direct browser table access and grants only controlled RPCs", () => {
    expect(migration).toContain(
      "revoke all on table public.club_events, public.event_registrations from public, anon, authenticated",
    );
    expect(migration).toContain("grant execute on function public.list_club_events(uuid) to authenticated");
    expect(migration).toContain("grant execute on function public.set_my_event_registration");
  });

  it("serializes capacity decisions inside the registration transaction", () => {
    expect(migration).toMatch(/where id = p_event_id and club_id = p_club_id for update/u);
    expect(migration).toContain("registration.app_account_id <> actor_id");
    expect(migration).toContain("event_capacity_full");
  });

  it("enforces relational tenant integrity and immutable identifiers", () => {
    expect(integrity).toContain("foreign key (event_id, club_id)");
    expect(integrity).toContain("references public.club_events (id, club_id)");
    expect(integrity.match(/old\.id is distinct from new\.id/gu)).toHaveLength(2);
  });

  it("projects management and registration access from the event module", () => {
    expect(access).toContain("can_manage boolean");
    expect(access).toContain("can_register boolean");
    expect(access).toContain("public.current_has_active_event_membership(club.id) as can_register");
  });

  it("requires active tenant lifecycle and writes audit records", () => {
    expect(migration).toContain("membership.membership_status = 'active'");
    expect(migration).toContain("club.club_status = 'active'");
    expect(migration).toContain("event.registration_updated");
    expect(migration).toContain("event.published");
    expect(migration).toContain("event.cancelled");
  });
});
