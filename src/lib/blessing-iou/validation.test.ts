import { describe, expect, it } from "vitest";
import {
  decodeBlessingCursor,
  encodeBlessingCursor,
  isSameOriginBlessingMutation,
  normalizeBlessingText,
  parseBlessingDeleteBody,
  parseBlessingEntryBody,
  parseBlessingSettingBody,
} from "./validation";

describe("blessing IOU request validation", () => {
  it("normalizes text and accepts optional integer TWD pledges", () => {
    expect(normalizeBlessingText("  第一行\r\n第二行  ")).toBe("第一行\n第二行");
    expect(parseBlessingEntryBody({
      blessingText: "祝福大家",
      pledgedAmount: 1000,
      hideAmount: true,
    })).toEqual({ blessingText: "祝福大家", pledgedAmount: 1000, hideAmount: true });
    expect(parseBlessingEntryBody({
      blessingText: "純祝福",
      pledgedAmount: null,
      hideAmount: false,
    }).pledgedAmount).toBeNull();
  });

  it("rejects blank text, fractional or unsafe amounts, and unknown keys", () => {
    expect(() => parseBlessingEntryBody({
      blessingText: " ", pledgedAmount: null, hideAmount: false,
    })).toThrow();
    expect(() => parseBlessingEntryBody({
      blessingText: "祝福", pledgedAmount: 1.5, hideAmount: false,
    })).toThrow();
    expect(() => parseBlessingEntryBody({
      blessingText: "祝福", pledgedAmount: 100, hideAmount: false, clubId: "forged",
    })).toThrow();
  });

  it("requires bounded manager reasons and exact setting payloads", () => {
    expect(parseBlessingDeleteBody({ reason: null })).toEqual({ reason: null });
    expect(parseBlessingDeleteBody({ reason: " 重複建立 " })).toEqual({ reason: "重複建立" });
    expect(() => parseBlessingDeleteBody({ reason: "x" })).toThrow();
    expect(parseBlessingSettingBody({ allowPublicAmounts: true })).toEqual({ allowPublicAmounts: true });
    expect(() => parseBlessingSettingBody({ allowPublicAmounts: true, clubId: "forged" })).toThrow();
  });

  it("round-trips canonical cursors and rejects tampering", () => {
    const cursor = encodeBlessingCursor({
      v: 1,
      created_at: "2026-08-19T10:00:00.000Z",
      id: "31000000-0000-4000-8000-000000000001",
    });
    expect(decodeBlessingCursor(cursor)).toEqual({
      createdAt: "2026-08-19T10:00:00.000Z",
      id: "31000000-0000-4000-8000-000000000001",
    });
    expect(() => decodeBlessingCursor(`${cursor}=`)).toThrow();
  });

  it("requires a same-origin mutation and fails closed for malformed origins", () => {
    expect(isSameOriginBlessingMutation({
      requestOrigin: "https://rotary.example.test",
      origin: "https://rotary.example.test",
      fetchSite: "same-origin",
      production: true,
    })).toBe(true);
    expect(isSameOriginBlessingMutation({
      requestOrigin: "https://rotary.example.test",
      origin: "https://evil.example.test",
      fetchSite: "cross-site",
      production: true,
    })).toBe(false);
    expect(isSameOriginBlessingMutation({
      requestOrigin: "https://rotary.example.test",
      origin: null,
      fetchSite: null,
      production: true,
    })).toBe(false);
  });
});
