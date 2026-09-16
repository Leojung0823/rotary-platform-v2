import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coverImageError } from "./cover-image";

function rendered(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/gu, "")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^\s*\/\/.*$/gmu, "");
}

const actions = rendered("src/app/event-actions.ts");
const upload = rendered("src/components/events/event-cover-upload.tsx");

function coverAction(): string {
  const start = actions.indexOf("export async function recordEventCoverAction");
  expect(start).toBeGreaterThan(-1);
  return actions.slice(start, actions.indexOf("\nexport async function publishEventAction", start));
}

describe("an upload that did not finish does not say it did", () => {
  // The bytes reaching Storage is half the job. Attaching the object to its
  // event is the other half, and it used to fail in silence while the button
  // said 「圖片已更新。」 -- so a failed upload and a successful one looked the
  // same, and neither Leo nor I could tell which had happened.
  it("returns an outcome instead of nothing", () => {
    const body = coverAction();
    expect(body).toContain("Promise<EventCoverActionResult>");
    expect(body, "the RPC error is still swallowed").not.toMatch(/if \(error\) return;/u);
    expect(body).toContain("return { ok: false, reason: error.message");
  });

  it("reports every way it can fail, not just the RPC", () => {
    expect(coverAction()).toContain('return { ok: false, reason: "invalid_input" }');
  });

  it("says so before claiming success", () => {
    // Both halves of the component: attaching and detaching.
    const successes = [...upload.matchAll(/setMessage\("圖片已(更新|移除)。"\)/gu)];
    expect(successes.length).toBe(2);
    for (const success of successes) {
      const before = upload.slice(Math.max(0, success.index! - 400), success.index!);
      expect(before, "success is announced without checking the outcome").toContain("recorded.ok");
    }
  });

  it("waits for the answer rather than firing and forgetting", () => {
    expect(upload).toContain("await recordEventCoverAction(");
    expect(upload, "the action is still fired and forgotten")
      .not.toMatch(/void recordEventCoverAction\(/u);
  });
});

describe("the officer is told what to do about it", () => {
  it.each([
    ["event_manage_required", "權限"],
    ["invalid_event_cover_path", "重新整理"],
    ["event_not_found", "找不到"],
    ["record_failed", "沒有存進"],
  ])("%s reads as something actionable", (code, fragment) => {
    expect(coverImageError(code)).toContain(fragment);
  });

  it("distinguishes a failed upload from a failed attach", () => {
    // "上傳失敗" and "圖片已上傳，但沒有存進…" are different instructions: one
    // says try again, the other says check first.
    expect(coverImageError("upload_failed")).not.toBe(coverImageError("record_failed"));
  });

  it("still has a fallback for a code it has never seen", () => {
    expect(coverImageError("something_new")).toBeTruthy();
  });
});

describe("recording a cover refreshes everywhere it is shown", () => {
  it("revalidates the event's own page too", () => {
    // It revalidated the lists but not /events/[eventId], so the detail page
    // kept the old picture until something else invalidated it.
    expect(coverAction()).toContain("revalidatePath(`/events/${event}`)");
    expect(coverAction()).toContain('revalidatePath("/events")');
    expect(coverAction()).toContain("revalidatePath(`/clubs/${club}/events`)");
  });
});
