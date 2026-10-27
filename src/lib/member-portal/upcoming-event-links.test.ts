import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberPortalBody } from "@/components/member-portal/member-portal";
import { upcomingEventsFrom } from "./from-projection";
import { registrationLabels } from "./types";
import type { MemberHomeUpcomingEvent } from "@/lib/member-home";

const clubId = "3df4b471-40e1-494e-a3ce-9f7285500eb0";
const events: MemberHomeUpcomingEvent[] = ["open", "registered", "declined", "closed"].map((state, index) => ({
  eventId: `00000000-0000-4000-8000-00000000000${index}`,
  title: "同名例會",
  startsAt: "2026-11-16T16:00:00.000Z",
  timeUnspecified: index === 1,
  registrationState: state as MemberHomeUpcomingEvent["registrationState"],
}));

describe("home upcoming events lead to their own member detail", () => {
  it("keeps same-title events distinct and carries the selected club and member mode", () => {
    const rows = upcomingEventsFrom(events, clubId);
    expect(new Set(rows.map((row) => row.id)).size).toBe(events.length);
    for (const [index, row] of rows.entries()) {
      const url = new URL(row.href, "https://example.test");
      expect(url.pathname).toBe(`/events/${events[index].eventId}`);
      expect(url.searchParams.get("clubId")).toBe(clubId);
      expect(url.searchParams.get("mode")).toBe("member");
    }
    expect(rows.map((row) => row.state)).toEqual(["open", "registered", "declined", "closed"]);
    expect(registrationLabels[rows[2].state]).toBe("不克出席");
    expect(rows[1].when).toContain("時間未定");
    expect(rows[1].day).toBe("17日");
  });

  it("does not let an identifier inject another path, query or fragment", () => {
    const [row] = upcomingEventsFrom([{ ...events[0], eventId: "id/?mode=management#other" }], "club&mode=management");
    const url = new URL(row.href, "https://example.test");
    expect(url.pathname).toBe("/events/id%2F%3Fmode%3Dmanagement%23other");
    expect(url.searchParams.get("clubId")).toBe("club&mode=management");
    expect(url.searchParams.getAll("mode")).toEqual(["member"]);
    expect(url.hash).toBe("");
  });

  it("renders every whole row as a native link, including registered and closed events", () => {
    const rows = upcomingEventsFrom(events, clubId);
    const html = renderToStaticMarkup(createElement(MemberPortalBody, {
      featuredEvent: null,
      upcomingEvents: rows,
      eventsHref: `/events?clubId=${clubId}&mode=member`,
      tasks: [], announcements: [], entries: [],
      taskCenterHref: "/tasks", messagesHref: "/messages",
    }));
    const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gu)];
    for (const row of rows) {
      const link = anchors.find(([, href]) => href.replaceAll("&amp;", "&") === row.href);
      expect(link, `missing link to ${row.id}`).toBeDefined();
      expect(link![2]).toContain(row.title);
      expect(link![2]).toContain(row.day);
      expect(link![2]).toContain(row.when);
      expect(link![2]).not.toMatch(/<(?:button|a)\b/u);
    }
    const declinedRow = anchors.find(([, href]) => href.replaceAll("&amp;", "&") === rows[2].href);
    expect(declinedRow?.[2]).toContain("不克出席");
    expect(anchors.some(([, href, label]) => href === `/events?clubId=${clubId}&amp;mode=member` && label.includes("查看全部"))).toBe(true);
  });
});
