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

describe("event page header actions", () => {
  it("keeps the explanatory note out of the button row", () => {
    // With the note between them, the two buttons and the prose all competed
    // for one row and the labels broke mid-word.
    const header = listPage.slice(listPage.indexOf('className="header-actions"'));
    const buttonRow = header.slice(header.indexOf('className="form-actions"'), header.indexOf("</div>"));
    expect(buttonRow).not.toContain('className="hint"');
    expect(header).toContain('className="hint"');
  });

  it("lets a crowded action row wrap instead of squeezing its buttons", () => {
    expect(globals).toContain(".form-actions { display: flex; flex-wrap: wrap;");
  });
});

describe("event cover framing", () => {
  it("crops the same poster the same way wherever it appears", () => {
    // The home card and the events list had drifted to 8/3 and 16/9, so one
    // image was cut two different ways depending on where a member looked.
    const home = readFileSync("src/components/member-portal/member-portal.module.css", "utf8");
    // What matters is that there is exactly one ratio and both places read it,
    // not which ratio it happens to be -- pinning the number here meant a
    // deliberate change to the framing looked like a regression.
    expect(globals).toMatch(/--event-cover-aspect:\s*\d+\s*\/\s*\d+/u);
    expect(globals).toContain("aspect-ratio: var(--event-cover-aspect)");
    expect(home).toContain("aspect-ratio: var(--event-cover-aspect)");
    for (const css of [globals, home]) {
      const literals = css.match(/aspect-ratio:\s*\d+\s*\/\s*\d+/gu) ?? [];
      expect(literals, "a cover ratio was written out instead of read from the token").toEqual([]);
    }
  });
});
