import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) { return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"); }

describe("member-first event application boundary", () => {
  const page = source("app/(authenticated)/events/page.tsx");
  const detail = source("app/(authenticated)/events/[eventId]/page.tsx");
  const management = source("app/(authenticated)/clubs/[clubId]/events/page.tsx");
  const actions = source("app/event-actions.ts");
  const shell = source("components/app-shell.tsx");

  it("keeps exactly four member navigation destinations and uses activities in both layouts", () => {
    expect(shell).toContain('{ href: "/events", label: "活動"');
    expect(shell).toContain("<MemberNavigation pathname={pathname} />");
    expect(shell).toContain("<MemberNavigation pathname={pathname} mobile />");
    expect(shell).not.toContain("/features");
  });

  it("separates the compact member list, detail registration, and management mutations", () => {
    expect(page).toContain('rpc("list_member_events"');
    expect(page).not.toContain("createEventAction");
    expect(detail).toContain("{event.description}");
    expect(detail).toContain("registerEventAction");
    expect(management).toContain("createEventAction");
    expect(management).toContain("publishEventAction");
    expect(management).toContain("cancelEventAction");
  });

  it("uses controlled RPCs and never exposes raw database errors", () => {
    expect(page).toContain('rpc("list_my_member_clubs")');
    for (const rpc of ["create_club_event", "publish_club_event", "cancel_club_event", "set_my_event_registration"]) expect(actions).toContain(`rpc("${rpc}"`);
    expect(actions).not.toContain('.from("club_events")');
    expect(actions).not.toContain("redirect(error.message");
    expect(page).not.toContain("dangerouslySetInnerHTML");
    expect(detail).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("event database boundary", () => {
  const migration = source("../supabase/migrations/20260729000100_event_registration_mvp.sql");
  const integrity = source("../supabase/migrations/20260729000110_event_registration_tenant_integrity.sql");
  const lifecycle = source("../supabase/migrations/20260729000130_event_active_club_hardening.sql");
  const projections = source("../supabase/migrations/20260805000300_member_experience_projections.sql");

  it("denies direct browser table access and grants only controlled RPCs", () => {
    expect(migration).toContain("revoke all on table public.club_events, public.event_registrations from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.set_my_event_registration");
    expect(projections).toContain("grant execute on function public.list_member_events(uuid) to authenticated");
  });

  it("serializes capacity and enforces tenant/lifecycle integrity", () => {
    expect(migration).toMatch(/where id = p_event_id and club_id = p_club_id for update/u);
    expect(migration).toContain("event_capacity_full");
    expect(integrity).toContain("foreign key (event_id, club_id)");
    expect(lifecycle).toContain("current_can_manage_active_club_events");
    expect(lifecycle).toContain("club.club_status = 'active'");
  });

  it("exposes member-safe projections without implementation versions", () => {
    expect(projections).toContain("create or replace function public.list_member_events");
    expect(projections).toContain("create or replace function public.get_member_event_detail");
    expect(projections).not.toContain("'version', event.version");
  });
});
