import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addressVariants, pickResult } from "./geocode";

const source = readFileSync("src/lib/events/geocode.ts", "utf8");
const actions = readFileSync("src/app/event-actions.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260914000900_event_venue_geocode_gate.sql",
  "utf8",
);

describe("venue address variants", () => {
  it("tries the address as typed, with the country, and without spaces", () => {
    expect(addressVariants("新北市板橋區 文化路一段 1 號")).toEqual([
      "新北市板橋區 文化路一段 1 號",
      "新北市板橋區 文化路一段 1 號 台灣",
      "新北市板橋區文化路一段1號",
    ]);
  });

  it("does not append the country when the address already names it", () => {
    expect(addressVariants("台灣新北市板橋區")).toEqual(["台灣新北市板橋區"]);
  });

  it("ignores an empty address rather than asking the provider about nothing", () => {
    expect(addressVariants("   ")).toEqual([]);
  });
});

describe("choosing a geocode result", () => {
  const taipei = { formatted_address: "台北", geometry: { location: { lat: 25.03, lng: 121.56 } } };
  const elsewhere = { formatted_address: "somewhere", geometry: { location: { lat: 51.5, lng: -0.12 } } };

  it("prefers a result inside Taiwan over one that merely shares a name", () => {
    expect(pickResult({ status: "OK", results: [elsewhere, taipei] })?.formattedAddress).toBe("台北");
  });

  it("still answers when every result is outside Taiwan", () => {
    expect(pickResult({ status: "OK", results: [elsewhere] })?.latitude).toBe(51.5);
  });

  it("treats a non-OK status as no answer", () => {
    expect(pickResult({ status: "ZERO_RESULTS", results: [] })).toBeNull();
  });

  it("skips a result whose coordinates are not numbers", () => {
    expect(pickResult({
      status: "OK",
      results: [{ geometry: { location: { lat: "25.03", lng: 121.56 } } }],
    })).toBeNull();
  });
});

describe("geocoding boundaries", () => {
  it("keeps the API key on the server", () => {
    expect(source).toContain('import "server-only"');
    expect(source).toContain("process.env.GOOGLE_MAPS_API_KEY");
    // The action hands back coordinates, never the key or the raw response.
    expect(actions).not.toContain("GOOGLE_MAPS_API_KEY");
  });

  it("gives the provider a deadline", () => {
    expect(source).toContain("AbortSignal.timeout(10_000)");
  });

  it("gates the lookup on the authority to manage the club's events", () => {
    // Each lookup is a billed request; without this any signed-in member could
    // use the club's key as a free geocoding service.
    expect(actions).toContain('supabase.rpc("current_can_manage_club_events"');
    expect(migration).toContain("current_has_club_permission(p_club_id, 'event.manage')");
    expect(migration).toContain("grant execute on function public.current_can_manage_club_events(uuid) to authenticated;");
  });

  it("says so plainly when the environment has no key rather than looking broken", () => {
    expect(actions).toContain("這個環境還沒有設定地圖查詢金鑰");
  });
});
