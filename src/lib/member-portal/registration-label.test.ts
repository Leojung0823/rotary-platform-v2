import { describe, expect, it } from "vitest";
import { memberHomeRegistrationStates } from "@/lib/member-home";
import { featuredEventFrom } from "./from-projection";
import { registrationLabels, type PortalRegistrationState } from "./types";

function featuredWith(registrationState: string, registrationOpen = true) {
  return featuredEventFrom({
    eventType: "regular_meeting",
    coverImagePath: null,
    title: "9月份理事會",
    location: "大拙匠人食品有限公司",
    startsAt: "2026-09-17T10:30:00.000Z",
    endsAt: "2026-09-17T12:30:00.000Z",
    registrationState: registrationState as never,
    registrationOpen,
    checkinState: "not_open",
  }, undefined);
}

describe("the hero says what the member's own answer was", () => {
  // 報名截止 stood for both "the deadline passed" and "you said no", so a
  // member who declined an event that was still open was told it had closed --
  // and given no hint that they could change their mind. Leo caught it on a
  // board meeting whose deadline had not passed.
  it("does not call a declined event closed", () => {
    expect(registrationLabels[featuredWith("declined").registration])
      .not.toBe(registrationLabels.closed);
  });

  it("reserves 報名截止 for a deadline that actually passed", () => {
    expect(registrationLabels[featuredWith("registration_closed").registration]).toBe("報名截止");
  });

  it("keeps every other answer distinct from every other", () => {
    const shown = new Map<string, string[]>();
    for (const state of memberHomeRegistrationStates) {
      const label = registrationLabels[featuredWith(state).registration];
      shown.set(label, [...(shown.get(label) ?? []), state]);
    }
    // 'pending' and 'not_registered' are the same sentence on purpose: both
    // mean "you have not answered". Nothing else may share a label.
    const collisions = [...shown].filter(([, states]) => states.length > 1);
    expect(collisions).toEqual([["尚未報名", ["not_registered", "pending"]]]);
  });

  it("has a label for every state the portal can be in", () => {
    const states: PortalRegistrationState[] = ["not_registered", "registered", "declined", "open", "closed"];
    for (const state of states) expect(registrationLabels[state]).toBeTruthy();
  });
});
