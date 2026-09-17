import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { locationCheckinBlockers } from "./location-blockers";
import type { ClubEvent } from "@/lib/events/page-contract";

const now = new Date("2026-09-17T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function event(overrides: Partial<ClubEvent> & { id: string }): ClubEvent {
  return {
    event_type: "regular_meeting", title: `活動 ${overrides.id}`, description: "", location: "",
    starts_at: new Date(now.getTime() + HOUR).toISOString(),
    ends_at: new Date(now.getTime() + 3 * HOUR).toISOString(),
    registration_deadline: null, capacity: null, counts_for_attendance: true,
    status: "published", version: 1, attending_members: 0, attending_spots: 0,
    remaining_spots: null, my_response: null, my_guest_count: 0, my_note: "",
    can_manage: false, cover_image_path: null, registration_open: true,
    venue_location_set: true,
    ...overrides,
  } as ClubEvent;
}

function reasonFor(overrides: Partial<ClubEvent> & { id: string }) {
  return locationCheckinBlockers([event(overrides)], now)[0]?.reason ?? null;
}

describe("簽到頁要說出這裡為什麼是空的", () => {
  // The panel said 「活動需要由管理者開啟簽到，且建立活動時要設定場地座標」 --
  // the conditions in the abstract, on a page that already knows the answer for
  // every event in front of it. Someone standing at the venue had to work out
  // which of six things was missing.

  it("names a missing venue before anything else", () => {
    // Telling someone to wait for a window that will never open is worse than
    // telling them nothing.
    expect(reasonFor({ id: "a", venue_location_set: false })).toBe("no_venue");
    expect(reasonFor({
      id: "b", venue_location_set: false,
      starts_at: new Date(now.getTime() + 5 * HOUR).toISOString(),
      ends_at: new Date(now.getTime() + 7 * HOUR).toISOString(),
    }), "a distant event without coordinates was described by its clock").toBe("no_venue");
  });

  it("says too early up to an hour before the start", () => {
    expect(reasonFor({
      id: "c",
      starts_at: new Date(now.getTime() + 61 * 60_000).toISOString(),
      ends_at: new Date(now.getTime() + 3 * HOUR).toISOString(),
    })).toBe("too_early");
  });

  it("says too late from an hour after the end", () => {
    expect(reasonFor({
      id: "d",
      starts_at: new Date(now.getTime() - 4 * HOUR).toISOString(),
      ends_at: new Date(now.getTime() - 61 * 60_000).toISOString(),
    })).toBe("too_late");
  });

  it("stays open through a long event, not an hour after it starts", () => {
    // The case that distinguishes the two windows, and the one the correction
    // to 「開始前一小時到結束後一小時」 was about: a meeting three hours in and
    // still running. Measured from the start it would already be over.
    expect(reasonFor({
      id: "long",
      starts_at: new Date(now.getTime() - 3 * HOUR).toISOString(),
      ends_at: new Date(now.getTime() + 30 * 60_000).toISOString(),
    })).toBe("session_closed");
  });

  it("names the check-in session once everything on this side checks out", () => {
    // The one condition this page cannot see. Saying "everything here is fine"
    // without naming what is left is the answer the page already gave.
    expect(reasonFor({
      id: "e",
      starts_at: new Date(now.getTime() - 30 * 60_000).toISOString(),
      ends_at: new Date(now.getTime() + 90 * 60_000).toISOString(),
    })).toBe("session_closed");
    expect(reasonFor({
      id: "f",
      starts_at: new Date(now.getTime() + 59 * 60_000).toISOString(),
      ends_at: new Date(now.getTime() + 3 * HOUR).toISOString(),
    }), "an event inside the window was called too early").toBe("session_closed");
  });

  it("puts what someone can act on now at the top", () => {
    const blockers = locationCheckinBlockers([
      event({ id: "late", starts_at: new Date(now.getTime() - 5 * HOUR).toISOString(), ends_at: new Date(now.getTime() - 3 * HOUR).toISOString() }),
      event({ id: "novenue", venue_location_set: false }),
      event({ id: "open", starts_at: new Date(now.getTime() - 10 * 60_000).toISOString(), ends_at: new Date(now.getTime() + HOUR).toISOString() }),
    ], now);
    expect(blockers[0].eventId).toBe("open");
    expect(blockers.at(-1)?.eventId).toBe("late");
  });

  it("leaves out drafts and anything far away", () => {
    expect(locationCheckinBlockers([event({ id: "draft", status: "draft" })], now)).toEqual([]);
    expect(locationCheckinBlockers([event({
      id: "far",
      starts_at: new Date(now.getTime() + 30 * 24 * HOUR).toISOString(),
      ends_at: new Date(now.getTime() + 30 * 24 * HOUR + HOUR).toISOString(),
    })], now)).toEqual([]);
  });

  it("says nothing when there is nothing to explain", () => {
    expect(locationCheckinBlockers([], now)).toEqual([]);
  });
});

describe("只在真的空的時候才解釋", () => {
  const page = readFileSync("src/app/(authenticated)/events/checkin/page.tsx", "utf8");

  it("does not fetch or show the explanation when there is something on offer", () => {
    expect(page).toMatch(/locationEvents\.length === 0[\s\S]{0,200}list_my_event_page/u);
    expect(page).toMatch(/locationEvents\.length === 0 && <LocationCheckinDiagnosis/u);
  });

  it("names every reason it can produce", () => {
    const component = readFileSync("src/components/events/location-checkin-diagnosis.tsx", "utf8");
    for (const reason of ["no_venue", "too_early", "too_late", "session_closed"]) {
      expect(component, `${reason} has no sentence`).toContain(`${reason}:`);
    }
  });
});
