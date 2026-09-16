import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const listPath = "src/app/(authenticated)/events/page.tsx";
const detailPath = "src/app/(authenticated)/events/[eventId]/page.tsx";
/**
 * The source with its comments removed.
 *
 * "This page does not render X" is a claim about what it renders. Asserting it
 * against the raw file makes a comment explaining why X was removed enough to
 * fail the test -- which is how a guard teaches you to stop writing comments.
 */
function rendered(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/gu, "")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");
}

const list = rendered(listPath);
const detail = rendered(detailPath);
const css = readFileSync("src/app/globals.css", "utf8");

describe("the member events page offers no way into management", () => {
  // Leo is an officer and was still shown 活動管理 while reading the page as a
  // member -- next to a hint saying that very feature had moved. The way into
  // management is the shell's mode switch, present on every page.
  it("renders no element labelled 活動管理", () => {
    // Matched as a rendered label, not as the string anywhere: the page's own
    // prose says 「具活動管理權限的帳號」, which is an explanation, not an offer.
    expect(list).not.toMatch(/>\s*活動管理\s*<\/(a|Link)>/u);
    expect(list).not.toContain("幹部功能已移至社務管理模式");
  });

  it("puts no management route in the page header", () => {
    const header = list.slice(list.indexOf("function EventHeader"), list.indexOf("export default async function"));
    expect(header).not.toContain("mode=management");
    expect(header).not.toContain("/clubs/");
  });

  it("keeps the compatibility redirect, which is routing and not an offer", () => {
    // /events?mode=management is an old bookmark; it still resolves to the
    // canonical manager route. Asserting it survives keeps the guard above
    // from being "delete every occurrence of the string".
    expect(list).toContain("redirect(`/clubs/${encodeURIComponent(selectedClub.club_id)}/events?mode=management`)");
  });

  it("renders no link into management anywhere on the page", () => {
    // 活動管理 was removed from the header, but 管理簽到 was still sitting in
    // every event card's footer -- the same offer, one fold further down, and
    // it outlived the guard because that guard only read the header function.
    // Every route into management is one rule, not one rule per button.
    //
    // Asserted per line rather than by picking hrefs out: an href here is a
    // template literal, and `${...}` ends any pattern that tries to read one
    // as a single quoted string -- which is how the first version of this
    // guard let 管理簽到 straight back in.
    const offers = list.split("\n")
      .filter((line) => line.includes("mode=management") || line.includes("/clubs/"))
      .filter((line) => !line.includes("redirect("));
    expect(offers, "the member page routes into management").toEqual([]);
  });

  it("still offers 本人簽到, which is the member's own action", () => {
    // The point is not "no check-in link". A member signs themselves in from
    // here; what left is the route that manages everyone else's.
    expect(list).toMatch(/>\s*本人簽到\s*<\/Link>/u);
    expect(list).not.toMatch(/>\s*管理簽到\s*<\/a>/u);
  });

  it("offers it on the member's own condition, not on an empty row", () => {
    // 本人簽到 and 管理簽到 shared a wrapper gated on counts_for_attendance. With
    // 管理簽到 gone, an officer who is not a member of this club would have been
    // shown an empty .form-actions strip.
    //
    // Read forwards from the wrapper to the label rather than backwards from
    // the label: 400 characters back reaches the notice above, whose own
    // condition is `!selectedClub.can_register` -- so the first version of this
    // guard passed while reading a different line entirely.
    const at = list.indexOf("本人簽到");
    const wrapper = list.lastIndexOf("counts_for_attendance", at);
    expect(wrapper, "the check-in row no longer follows counts_for_attendance").toBeGreaterThan(-1);
    const condition = list.slice(wrapper, at);
    expect(condition.length, "the label moved away from its wrapper").toBeLessThan(200);
    expect(condition, "the row is not gated on the member's own ability to check in")
      .toMatch(/&&\s*selectedClub\.can_register/u);
  });

  it("does not take a canManage flag it no longer needs", () => {
    // A flag left behind is an invitation to render something from it again.
    expect(list).not.toContain("canManage");
  });

  it("gates the detail page's management hint on management mode", () => {
    const hint = detail.slice(detail.indexOf("管理這場活動請回到") - 400, detail.indexOf("管理這場活動請回到"));
    expect(hint).toContain("managementView && event.can_manage");
  });
});

describe("each event starts collapsed", () => {
  // A list where every card is already expanded is a list you scroll past
  // rather than read.
  it("wraps the card body in a disclosure", () => {
    expect(list).toContain('<details className="event-fold">');
  });

  it("does not open it by default", () => {
    const fold = list.slice(list.indexOf('<details className="event-fold"'), list.indexOf("</summary>"));
    expect(fold).not.toMatch(/<details[^>]*\sopen/u);
  });

  it("keeps what the choice is made on outside the fold", () => {
    const summary = list.slice(list.indexOf("<summary>"), list.indexOf("</summary>"));
    expect(summary, "the title must stay visible").toContain("{event.title}");
    expect(summary, "the time must stay visible").toContain("formatEventTimeRange");
    expect(summary, "the status must stay visible").toContain("statusLabels[event.status]");
  });

  it("keeps the cover visible without opening anything", () => {
    // It is how a member recognises an event at a glance, which is the choice
    // the collapsed list exists to help them make.
    const beforeFold = list.slice(list.indexOf("{events.map("), list.indexOf('<details className="event-fold">'));
    expect(beforeFold).toContain('className="event-cover"');
  });
});

describe("the answer and the guest count are one row", () => {
  it("does not use the grid that stacks on a narrow screen", () => {
    for (const [name, source] of [["list", list], ["detail", detail]] as const) {
      const form = source.slice(source.indexOf("我的回覆") - 300, source.indexOf("我的回覆"));
      expect(form, `${name} still uses form-grid`).not.toContain('className="form-grid"');
      expect(form).toContain('className="response-grid"');
    }
  });

  it("keeps two columns at every width", () => {
    expect(css).toMatch(/\.response-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/u);
    // Nothing may collapse it inside a media query.
    for (const block of css.split("@media").slice(1)) {
      expect(block, "a media query collapses .response-grid").not.toMatch(/\.response-grid[^{]*\{[^}]*grid-template-columns:\s*1fr\s*[;}]/u);
    }
  });
});

describe("the time range and the links come from one place", () => {
  it("formats every event time through the shared formatter", () => {
    expect(list).toContain("formatEventTimeRange(event.starts_at, event.ends_at)");
    expect(detail).toContain("formatEventClockRange(event.starts_at, event.ends_at)");
    // A second, hand-rolled range is how the two pages drift apart.
    expect(detail).not.toContain("function formatTimeRange");
  });

  it("prints no range built by hand", () => {
    // The previous version of this test only asked whether the shared
    // formatter appeared somewhere in the file, so replacing one of its two
    // call sites with the old string concatenation left it green. The claim
    // is that no range is built by hand anywhere -- an end stamped with its
    // own full date is exactly what Leo reported.
    for (const [name, source] of [["list", list], ["detail", detail]] as const) {
      expect(source, `${name} joins two formatted stamps by hand`)
        .not.toMatch(/formatDateTime\([^)]*starts_at[^)]*\)\s*\}?\s*[－–-]/u);
    }
  });

  it("still shows the start time beside every event in the list", () => {
    // Guarding against "no hand-rolled range" being satisfied by printing no
    // time at all.
    const summary = list.slice(list.indexOf("<summary>"), list.indexOf("</summary>"));
    expect(summary).toContain("formatEventTimeRange(event.starts_at, event.ends_at)");
    const body = list.slice(list.indexOf("</summary>"));
    expect(body).toContain("<strong>時間：</strong>{formatEventTimeRange(event.starts_at, event.ends_at)}");
  });

  it("renders a description through the component that linkifies it", () => {
    for (const [name, source] of [["list", list], ["detail", detail]] as const) {
      expect(source, `${name} renders the description as bare text`).toContain("<EventDescription");
      expect(source).not.toMatch(/>\{event\.description\}</u);
    }
  });
});
