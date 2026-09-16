import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/components/events/event-management-panel.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
const acceptance = readFileSync("e2e/tests/staging-management-acceptance.e2e.mjs", "utf8");

/** The body of the named JSX container, from its opening tag to its match. */
function container(source: string, className: string): string {
  const open = source.indexOf(`className="${className}"`);
  expect(open, `nothing renders .${className}`).toBeGreaterThan(-1);
  const tag = source.lastIndexOf("<", open);
  const name = /^<(\w+)/u.exec(source.slice(tag))?.[1] ?? "";
  let depth = 0;
  for (let at = tag; at < source.length; at += 1) {
    if (source.startsWith(`<${name}`, at)) depth += 1;
    else if (source.startsWith(`</${name}>`, at)) {
      depth -= 1;
      if (depth === 0) return source.slice(tag, at);
    }
  }
  throw new Error(`.${className} is never closed`);
}

describe("一張說得很少的卡片不該佔掉半個螢幕", () => {
  // Every action was its own block-level strip -- 管理簽到, 上傳圖片 and the
  // paragraph explaining it, 編輯活動, 發布活動, and a permanently open cancel
  // form -- plus a side column holding one number inside a card of its own.
  // Five rows of chrome and a boxed metric for an event with no description.

  it("puts every action in one row", () => {
    const actions = container(panel, "event-actions");
    for (const action of ["編輯活動", "EventCoverUpload", "管理簽到", "發布活動"]) {
      expect(actions, `${action} sits outside the actions row`).toContain(action);
    }
  });

  it("stops boxing one number inside a card of its own", () => {
    // The card is already a card; nesting another one around 目前參加 gave a
    // single figure the whole right-hand column.
    const card = panel.slice(panel.indexOf('<article className="card"'));
    expect(card.slice(0, card.indexOf("</article>")), "a card nested inside the event card")
      .not.toMatch(/<div className="card">/u);
    expect(panel, "the facts are no longer one paragraph each").toContain('className="event-facts"');
  });

  it("folds the destructive form away instead of leaving it open", () => {
    const danger = container(panel, "event-danger");
    expect(danger.startsWith("<details"), "取消活動 is not behind a disclosure").toBe(true);
    expect(danger).toContain("cancelEventAction");
    expect(danger).toContain("取消原因");
  });
});

describe("上線驗收那支測試要跟著版面走", () => {
  // staging-management-acceptance runs during Go-Live. It used to fill 取消原因
  // directly; behind a closed <details> that field is not visible, fill() waits
  // for it, and the deployment itself fails. Changing a visible layout means
  // reading the tests that drive it -- this is the one that can stop a release.
  it("opens the fold before it reaches for the reason", () => {
    const at = acceptance.indexOf('getByLabel("取消原因")');
    expect(at, "the acceptance test no longer fills 取消原因").toBeGreaterThan(-1);
    const before = acceptance.slice(0, at);
    expect(before, "it reaches for a field inside a closed <details>")
      .toContain('details.event-danger');
    expect(before.slice(before.indexOf("details.event-danger")))
      .toContain('locator("summary").click()');
  });
});

describe("每一個新類名都有規則", () => {
  // A class with no rule is a valid, empty className: typecheck, lint and build
  // all stay green while the layout quietly falls back to block flow. The CSS
  // module guard cannot see these -- they are plain strings against globals.css.
  it("defines every plain class this panel renders", () => {
    const rendered = [...panel.matchAll(/className="([a-z][\w\- ]*)"/gu)]
      .flatMap((match) => match[1].split(" "))
      .filter((name) => name.length > 0);
    expect(rendered.length, "no plain classes found; this guard is checking nothing")
      .toBeGreaterThan(5);
    const missing = [...new Set(rendered)]
      .filter((name) => !new RegExp(`\\.${name}[\\s,.:>{\\[]`, "u").test(globals));
    expect(missing, "globals.css has no rule for these").toEqual([]);
  });
});
