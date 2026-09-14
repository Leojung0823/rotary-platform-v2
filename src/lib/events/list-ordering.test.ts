import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260914000200_event_list_order_and_cancelled.sql",
  "utf8",
);
const listPage = readFileSync("src/app/(authenticated)/events/page.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");

describe("event list", () => {
  it("puts the most recent event first", () => {
    expect(migration).toContain("order by event.starts_at desc, event.id desc");
    expect(migration).not.toContain("order by event.starts_at, event.id)");
  });

  it("hides cancelled events from members but keeps them for managers", () => {
    expect(migration).toContain("and (e.event_status = 'published' or can_manage)");
    expect(migration).not.toContain("e.event_status in ('published', 'cancelled')");
  });

  it("keeps the organiser's line breaks in the description", () => {
    // A plain <p> collapses them, which turned a schedule with addresses and
    // map links into one unreadable block.
    expect(listPage).toContain('className="event-description"');
    expect(globals).toContain(".event-description");
    expect(globals).toContain("white-space: pre-wrap");
  });

  it("lets the long map URLs in a description break instead of widening the card", () => {
    const rule = globals.slice(globals.indexOf(".event-description"));
    expect(rule).toContain("overflow-wrap: anywhere");
  });
});
