import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestDefinition } from "@/lib/attendance/latest-definition";

const panel = readFileSync("src/components/dues-finance/dues-finance-management.tsx", "utf8");
const rendered = panel.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/gu, "").replace(/^\s*\/\/.*$/gmu, "");

/** The JSX of the named container, from its opening tag to its match. */
function container(className: string): string {
  const at = rendered.indexOf(`styles.${className}}`);
  expect(at, `nothing renders styles.${className}`).toBeGreaterThan(-1);
  const open = rendered.lastIndexOf("<", at);
  const name = /^<(\w+)/u.exec(rendered.slice(open))?.[1] ?? "";
  let depth = 0;
  for (let cursor = open; cursor < rendered.length; cursor += 1) {
    if (rendered.startsWith(`<${name}`, cursor)) depth += 1;
    else if (rendered.startsWith(`</${name}>`, cursor)) {
      depth -= 1;
      if (depth === 0) return rendered.slice(open, cursor);
    }
  }
  throw new Error(`styles.${className} is never closed`);
}

describe("收款是一列一個人，不是一次分配給所有人", () => {
  // The page used to render the same members twice: once as cards to read, and
  // again as a grid of number inputs to type into. Recording one payment meant
  // scrolling past both. A treasurer does this 40-200 times a year; allocating
  // a pile of money across everyone happens a handful of times.

  it("collects on the member's own row", () => {
    const item = container("rosterItem");
    expect(item, "the row has no way to take a payment").toContain("openRowReceipt(");
    expect(item, "the row's form does not submit a receipt").toContain("submitRowReceipt(");
  });

  it("prefills the amount with what is still owed", () => {
    // The overwhelmingly common case is paying in full, and it should cost no
    // typing at all.
    expect(panel).toMatch(/function openRowReceipt\([^)]*outstanding: number\)[\s\S]{0,260}setRowAmount\(String\(outstanding\)\)/u);
  });

  it("remembers the date and method between rows", () => {
    // Recording eight transfers from one bank statement should not mean setting
    // the date and method eight times.
    const form = container("rowReceipt");
    expect(form).toContain("value={receivedOn}");
    expect(form).toContain("value={paymentMethod}");
  });

  it("sorts the unpaid to the top and can filter to them", () => {
    expect(panel).toContain("matchesRosterFilter(");
    expect(panel, "the roster does not put outstanding members first")
      .toMatch(/outstandingAmount > 0\) !== \(right\.outstandingAmount > 0\)/u);
    expect(container("rosterTools"), "there is no way to search the roster").toContain("setRosterQuery(");
  });

  it("keeps partially paid members in the outstanding view and labels them", () => {
    expect(panel).toMatch(/filter === "unpaid"[\s\S]{0,180}status === "unpaid"[\s\S]{0,80}status === "partial"/u);
    expect(panel).toContain("部分收款");
  });

  it("keeps batch collection as a mode of the same list", () => {
    // It is the right tool for reconciling one lump deposit; it is the wrong
    // default. Deleting it would take a real capability away.
    expect(panel).toContain("一次收多筆");
    expect(panel).toContain("recordReceipt");
    const roster = container("roster");
    expect(roster, "batch entry became a second list rather than a mode").toContain("batchMode");
  });
});

describe("財務紀錄的不變量沒有被鬆動", () => {
  // The tempting shortcut is an unallocated receipt -- "money arrived, I will
  // say whose later". That opens an undecided state on an append-only finance
  // table. A row receipt is simply an allocation array of length one.

  it("still allocates the receipt in full, as a one-item array", () => {
    expect(panel).toMatch(/allocations: \[\{ receivableId, amount \}\]/u);
  });

  it("uses the same server action as batch collection", () => {
    const calls = [...panel.matchAll(/action: "record_receipt"/gu)];
    expect(calls.length, "row and batch collection diverged into two actions").toBe(2);
  });

  it("is still refused by the database when nothing is allocated", () => {
    // The guarantee this rests on, asserted where it actually lives.
    expect(latestDefinition("record_dues_receipt"))
      .toMatch(/jsonb_array_length\(p_items\) < 1/u);
  });
});
