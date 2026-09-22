import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function rendered(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/gu, "")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");
}

const portal = rendered("src/components/member-portal/member-portal.tsx");
const home = rendered("src/components/member-portal/member-portal-home.tsx");
const bell = rendered("src/components/member-portal/notification-bell.tsx");

describe("the bell opens in place", () => {
  // It was a link to the message centre, so finding out whether anything was
  // waiting meant leaving the home page -- and coming back when there was not.
  it("is a button, not a link", () => {
    expect(portal).toContain("<NotificationBell");
    expect(portal).not.toMatch(/<Link[^>]*styles\.bell/u);
    expect(bell).toMatch(/<button[\s\S]*?type="button"/u);
  });

  it("says whether it is open, and what it opens", () => {
    expect(bell).toContain("aria-expanded={open}");
    expect(bell).toContain("aria-controls={panelId}");
    expect(bell).toContain('id={panelId}');
  });

  it("closes the way an overlay is expected to", () => {
    expect(bell, "Escape must close it").toContain('event.key !== "Escape"');
    expect(bell, "a click outside must close it").toContain("wrapper.current?.contains");
    expect(bell, "Escape must return focus to the bell").toContain("button.current?.focus()");
  });

  it("still offers the message centre from inside the panel", () => {
    // The popover replaces the trip to /messages for a glance, not for good.
    expect(bell).toContain("messagesHref");
    expect(bell).toContain("開啟訊息中心");
  });
});

describe("the bell's contents do not delay the greeting", () => {
  // The header is painted before the projection arrives; that is the whole
  // reason it takes no data. Awaiting notifications in it would undo that.
  it("streams the panel behind its own boundary", () => {
    expect(home).toMatch(/bell=\{<Suspense fallback=\{<NotificationBellLoading \/>\}>/u);
    expect(home).toContain("<BellNotifications");
  });

  it("asks for the projection through the cached resolver", () => {
    // Two calls, one round trip -- resolveMemberHomeProjection is React-cached.
    // A second, uncached read here would double the page's database work.
    const body = home.slice(home.indexOf("async function BellNotifications"));
    expect(body).toContain("await resolveMemberHomeProjection(clubId)");
    expect(home).not.toContain("createClient");
  });
});

describe("each dashboard card links to its own list", () => {
  // 查看全部 was hardcoded to /events on every card, so the one under the
  // notices sent a member to the events page. Leo reported it.
  it("takes the destination as a prop", () => {
    expect(portal).toMatch(/<Link className=\{styles\.panelLink\} href=\{href\}/u);
    expect(portal).not.toContain('className={styles.panelLink} href="/events"');
  });

  it("sends the notices card to the message centre", () => {
    const card = portal.slice(portal.indexOf('title="社團訊息"'));
    expect(card.slice(0, 200)).toContain("href={messagesHref}");
  });

  it("links complete lists but not the mixed priority-task snapshot", () => {
    const cards = [...portal.matchAll(/<DashboardCard[^>]*>/gu)].map((match) => match[0]);
    expect(cards.length).toBeGreaterThanOrEqual(3);
    const tasks = cards.find((card) => card.includes('title="待辦提醒"'));
    expect(tasks).toBeDefined();
    expect(tasks).not.toContain("href=");
    for (const card of cards.filter((card) => card !== tasks)) expect(card).toContain("href=");
    expect(portal).toContain("{href && <Link");
    expect(portal).toContain("href={task.href}");
  });
});

describe("the notices card is called what it holds", () => {
  it("says 社團訊息, not 社團公告", () => {
    expect(portal).toContain("社團訊息");
    expect(portal).not.toContain("社團公告");
  });

  it("says the same thing when there is nothing", () => {
    expect(portal).toContain("目前沒有社團訊息");
  });
});
