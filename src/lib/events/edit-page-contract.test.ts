import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260915000300_event_list_manager_venue.sql", "utf8");
const pagePath = "src/app/(authenticated)/clubs/[clubId]/events/[eventId]/edit/page.tsx";
const page = readFileSync(pagePath, "utf8");

/** Every key a row of list_club_events actually carries. */
function emittedKeys(): Set<string> {
  const build = migration.slice(migration.indexOf("jsonb_agg(jsonb_build_object("));
  return new Set([...build.matchAll(/'([a-z_]+)',\s/gu)].map((match) => match[1]));
}

/** The field names the page declares for a row. */
function declaredFields(): string[] {
  const start = page.indexOf("type ManagedEvent = {");
  expect(start, "the page no longer declares the row shape").toBeGreaterThan(-1);
  const block = page.slice(start, page.indexOf("};", start));
  return [...block.matchAll(/^\s{2}([a-z_]+)[?]?:/gmu)].map((match) => match[1]);
}

/** The field the page matches the route's event id against. */
function lookupField(): string {
  const found = /events\.find\(\(\w+\) => \w+\.([a-z_]+) === eventId\)/u.exec(page);
  expect(found, "the page no longer looks the event up by a field").not.toBeNull();
  return found![1];
}

describe("the edit page reads fields the events list actually returns", () => {
  // This page answered 404 for every event from the day it shipped: it looked
  // for `event_id` on a row whose key is `id`, so find() never matched and
  // notFound() ran every time. Nothing failed -- notFound() is a legitimate
  // answer, and the tests that shipped with it string-matched the migration
  // and the form, neither of which mentions this page.
  //
  // The first version of this guard was itself vacuous: it only read
  // `target.<field>` and so never saw the lookup, which is where the defect
  // was. Checking the declared shape and the lookup covers both.
  it("looks the event up by a field the row carries", () => {
    expect(emittedKeys()).toContain(lookupField());
  });

  it("declares no field the row does not carry", () => {
    const emitted = emittedKeys();
    const declared = declaredFields();
    expect(declared.length, "the row shape should declare fields").toBeGreaterThan(5);
    expect(declared.filter((field) => !emitted.has(field))).toEqual([]);
  });

  it("still gives an officer the coordinates an edit would otherwise erase", () => {
    // Without these the form pre-fills nothing and saving writes null over the
    // geocoded location the address lookup exists to produce.
    const emitted = emittedKeys();
    expect(emitted.has("venue_latitude")).toBe(true);
    expect(emitted.has("venue_longitude")).toBe(true);
    expect(migration).toContain("case when can_manage then event.venue_latitude end");
    // A plain member still learns only whether one was set.
    expect(migration).toContain("'venue_location_set', event.venue_latitude is not null");
  });
});
