import { describe, expect, it } from "vitest";
import { normalizeMessageDraftDateTimes } from "./draft-date-time";

describe("normalizeMessageDraftDateTimes", () => {
  it("accepts a draft with no optional expiry or schedule", () => {
    expect(normalizeMessageDraftDateTimes("", "", "save")).toEqual({
      ok: true,
      expiresAt: "",
      scheduledAt: "",
    });
  });

  it("rejects an invalid non-empty expiry", () => {
    expect(normalizeMessageDraftDateTimes("not-a-date", "", "save")).toEqual({ ok: false });
  });

  it("requires a valid publish time only for scheduled drafts", () => {
    expect(normalizeMessageDraftDateTimes("", "", "schedule")).toEqual({ ok: false });

    const result = normalizeMessageDraftDateTimes("", "2026-10-27T09:30", "schedule");
    expect(result.ok).toBe(true);
    if (result.ok) expect(Number.isNaN(Date.parse(result.scheduledAt))).toBe(false);
  });
});
