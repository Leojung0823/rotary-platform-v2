import { describe, expect, it } from "vitest";
import {
  MESSAGE_BODY_MAX_CODE_POINTS,
  MESSAGE_TITLE_MAX_CODE_POINTS,
  decodeMessageCursor,
  encodeMessageCursor,
  normalizeMessageBody,
  normalizeMessageTitle,
  parseMessageClubId,
  parseMessageCreateBody,
  parseMessageId,
  parseMessageLimit,
} from "./validation";

const tagId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";

describe("message composition input", () => {
  it("keeps a title on one line and rejects an empty or oversized one", () => {
    expect(normalizeMessageTitle("  本週\n例會  改期  ")).toBe("本週 例會 改期");
    expect(() => normalizeMessageTitle("   ")).toThrow();
    expect(() => normalizeMessageTitle("字".repeat(MESSAGE_TITLE_MAX_CODE_POINTS + 1))).toThrow();
    expect(normalizeMessageTitle("字".repeat(MESSAGE_TITLE_MAX_CODE_POINTS)))
      .toHaveLength(MESSAGE_TITLE_MAX_CODE_POINTS);
  });

  it("keeps the body's line breaks but trims its ends", () => {
    expect(normalizeMessageBody("  一\r\n二\r三  ")).toBe("一\n二\n三");
    expect(() => normalizeMessageBody("\n\n")).toThrow();
    expect(() => normalizeMessageBody("字".repeat(MESSAGE_BODY_MAX_CODE_POINTS + 1))).toThrow();
  });

  it("counts code points, so an emoji-heavy body is not cut short by byte length", () => {
    expect(() => normalizeMessageBody("🎉".repeat(MESSAGE_BODY_MAX_CODE_POINTS))).not.toThrow();
    expect(() => normalizeMessageBody("🎉".repeat(MESSAGE_BODY_MAX_CODE_POINTS + 1))).toThrow();
  });

  it("accepts an audience of tags or of named members, never both", () => {
    expect(parseMessageCreateBody({ title: "標題", body: "內容", tagIds: [tagId] }))
      .toEqual({ title: "標題", body: "內容", tagIds: [tagId], membershipIds: [] });
    expect(parseMessageCreateBody({ title: "標題", body: "內容", membershipIds: [membershipId] }))
      .toEqual({ title: "標題", body: "內容", tagIds: [], membershipIds: [membershipId] });
    expect(() => parseMessageCreateBody({
      title: "標題",
      body: "內容",
      tagIds: [tagId],
      membershipIds: [membershipId],
    })).toThrow();
  });

  it("refuses unknown fields, missing fields, and identifiers that are not UUIDs", () => {
    expect(() => parseMessageCreateBody({ title: "標題", body: "內容", pinned: true })).toThrow();
    expect(() => parseMessageCreateBody({ title: "標題" })).toThrow();
    expect(() => parseMessageCreateBody({ body: "內容" })).toThrow();
    expect(() => parseMessageCreateBody({ title: "標題", body: "內容", tagIds: ["not-a-uuid"] })).toThrow();
    expect(() => parseMessageCreateBody({ title: "標題", body: "內容", tagIds: tagId })).toThrow();
  });

  it("collapses a repeated identifier instead of addressing someone twice", () => {
    expect(parseMessageCreateBody({ title: "標題", body: "內容", tagIds: [tagId, tagId] }).tagIds)
      .toEqual([tagId]);
  });
});

describe("message request parameters", () => {
  it("bounds the page size", () => {
    expect(parseMessageLimit(null)).toBe(20);
    expect(parseMessageLimit("50")).toBe(50);
    expect(() => parseMessageLimit("0")).toThrow();
    expect(() => parseMessageLimit("51")).toThrow();
    expect(() => parseMessageLimit("20.5")).toThrow();
  });

  it("requires real identifiers", () => {
    expect(parseMessageClubId(tagId.toUpperCase())).toBe(tagId);
    expect(() => parseMessageClubId(null)).toThrow();
    expect(() => parseMessageId("../../etc/passwd")).toThrow();
  });
});

describe("inbox cursors", () => {
  const payload = { v: 1, published_at: "2026-08-22T01:02:03.000Z", id: tagId };

  it("round trips a cursor", () => {
    const encoded = encodeMessageCursor(payload);
    expect(encoded).not.toBeNull();
    expect(decodeMessageCursor(encoded)).toEqual({ timestamp: payload.published_at, id: tagId });
  });

  it("has nothing to encode when there is no next page", () => {
    expect(encodeMessageCursor(null)).toBeNull();
    expect(decodeMessageCursor(null)).toBeNull();
    expect(decodeMessageCursor("")).toBeNull();
  });

  it("rejects a tampered, mis-keyed, or non-canonical cursor", () => {
    expect(() => decodeMessageCursor("not-base64url!")).toThrow();
    expect(() => decodeMessageCursor(Buffer.from('{"v":1,"created_at":"2026-08-22T00:00:00.000Z","id":"'
      + tagId + '"}', "utf8").toString("base64url"))).toThrow();
    expect(() => decodeMessageCursor(Buffer.from('{"v":2,"published_at":"2026-08-22T00:00:00.000Z","id":"'
      + tagId + '"}', "utf8").toString("base64url"))).toThrow();
    expect(() => decodeMessageCursor("a".repeat(600))).toThrow();
  });
});
