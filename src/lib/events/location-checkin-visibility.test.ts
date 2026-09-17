import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const panel = readFileSync("src/components/events/event-management-panel.tsx", "utf8");
const contract = readFileSync("src/lib/events/page-contract.ts", "utf8");
const memberPanel = readFileSync("src/components/events/location-checkin-panel.tsx", "utf8");

describe("幹部要在還能補救的時候，知道定位簽到會不會成立", () => {
  // Leo could not find 定位簽到 at all. The flag was the reason, but underneath
  // it sat a quieter one: an officer setting up an event has no indication
  // whether members will be offered it on the day. The member-facing panel does
  // explain itself -- and is only reachable once every condition already lines
  // up, which is too late for the person who could still fix it.

  it("carries whether the venue has coordinates", () => {
    // The projection has returned this since GPS check-in shipped; nothing read it.
    expect(latestDefinition("list_club_events")).toContain("'venue_location_set', event.venue_latitude is not null");
    expect(contract, "the page contract drops the field the projection sends")
      .toContain("venue_location_set: boolean;");
    expect(contract, "an unchecked field is a field that can arrive as anything")
      .toContain('typeof value.venue_location_set === "boolean"');
  });

  it("says so on the event the officer is looking at", () => {
    const facts = panel.slice(panel.indexOf('className="event-facts"'), panel.indexOf("</dl>"));
    expect(facts).toContain("定位簽到");
    expect(facts).toContain("event.venue_location_set");
  });

  it("says both halves, not only the good one", () => {
    // 「已設座標」 on its own is invisible when it matters: the officer who
    // needs telling is the one who left it blank.
    expect(panel).toContain("已設座標");
    expect(panel).toContain("未設座標，社員只能掃 QR");
  });

  it("offers the way to fix it while the event can still be edited", () => {
    const facts = panel.slice(panel.indexOf("<dt>定位簽到</dt>"), panel.indexOf("</dl>"));
    expect(facts, "it names the gap without offering the edit that closes it")
      .toContain("補上座標");
    expect(facts, "the link is offered for events the database will refuse to edit")
      .toMatch(/status === "draft" \|\| event\.status === "published"/u);
  });

  it("agrees with what the member is told", () => {
    // Two screens describing one setting must not disagree about it.
    expect(memberPanel).toContain("設定場地座標");
    expect(panel).toContain("座標");
  });
});
