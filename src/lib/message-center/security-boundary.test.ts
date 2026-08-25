import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("message centre rendering boundary", () => {
  const component = source("components/message-center/message-center.tsx");
  const css = source("components/message-center/message-center.module.css");

  it("renders officer-written content as escaped React text with safe line breaks", () => {
    expect(component).toContain("{message.body}");
    expect(component).toContain("href={message.action_path}");
    expect(component).toContain("actionStatusLabel(message.action_status)");
    expect(component).not.toContain("dangerouslySetInnerHTML");
    expect(component).not.toMatch(/href=\{message\.(body|title)\}|src=\{message\.(body|title)\}/);
    expect(css).toContain("white-space: pre-wrap");
  });

  it("does not distinguish unread by colour alone", () => {
    expect(css).toContain("border-left: 4px solid");
    expect(component).toContain("aria-label=\"未讀\"");
  });
});

describe("message centre API boundary", () => {
  const collectionRoute = source("app/api/v1/messages/route.ts");
  const deliveriesRoute = source("app/api/v1/messages/[messageId]/deliveries/route.ts");
  const actions = source("app/message-center-actions.ts");
  const http = source("lib/message-center/http.ts");

  it("exposes reads over HTTP and nothing else", () => {
    for (const route of [collectionRoute, deliveriesRoute]) {
      expect(route).toContain("authenticatedMessageClient");
      // Every mutation is a server action, so these endpoints must never grow
      // a writing method: they carry no origin check of their own.
      expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    }
    expect(http).toContain('"Cache-Control": "no-store"');
  });

  it("keeps every mutation in a server action that re-derives the caller", () => {
    expect(actions.startsWith('"use server";')).toBe(true);
    for (const rpc of ["create_club_message", "mark_club_message_read", "delete_club_message"]) {
      expect(actions).toContain(rpc);
    }
    // The club and message always come from the caller, so they are validated
    // as identifiers before they are handed to an RPC.
    expect(actions.match(/uuidPattern.test/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(actions).not.toContain("service_role");
  });

  it("does not return raw Supabase errors", () => {
    for (const route of [collectionRoute, deliveriesRoute]) {
      expect(route).not.toContain("error.message");
    }
    expect(actions).not.toContain("error.message");
    expect(http).toContain('{ error: "request_failed" }');
  });

  it("keeps the page behind its feature flag", () => {
    const page = source("app/(authenticated)/messages/page.tsx");
    expect(page).toContain('key: "announcements_v09"');
    expect(page).toContain("notFound()");
  });
});

describe("message centre database boundary", () => {
  const migration = readFileSync(
    new URL("../../../supabase/migrations/20260822000900_club_message_center.sql", import.meta.url),
    "utf8",
  );

  it("keeps every table closed to the browser and every definer function pinned", () => {
    for (const table of ["club_messages", "club_message_audiences", "club_message_recipients"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`revoke all on table public.${table} from public, anon, authenticated`);
    }
    const definerCount = migration.match(/security definer/g)?.length ?? 0;
    expect(migration.match(/set search_path = pg_catalog, public/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(definerCount);
  });

  it("grants only the functions members and officers actually call", () => {
    const granted = [...migration.matchAll(/grant execute on function public\.(\w+)\(/g)]
      .map((match) => match[1])
      .sort();
    expect(granted).toEqual([
      "count_my_unread_club_messages",
      "create_club_message",
      "delete_club_message",
      "list_club_message_deliveries",
      "list_club_sent_messages",
      "list_my_club_messages",
      "mark_club_message_read",
    ]);
    // The per-club counter and the membership lookup are building blocks for
    // the functions above, not endpoints of their own.
    expect(migration).toContain(
      "revoke all on function public.my_unread_club_message_count(uuid) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on function public.current_club_membership_id(uuid) from public, anon, authenticated",
    );
  });

  it("never hard deletes a message or its delivery record", () => {
    expect(migration).toContain("club_message_hard_delete_forbidden");
    expect(migration).toContain("club_message_recipient_immutable");
  });
});
