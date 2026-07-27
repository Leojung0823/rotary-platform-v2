import { describe, expect, it } from "vitest";
import {
  BOARD_CONTENT_MAX_CODE_POINTS,
  BOARD_CURSOR_MAX_LENGTH,
  boardContentLength,
  decodeBoardCursor,
  encodeBoardCursor,
  isJsonContentType,
  isSameOriginMutation,
  normalizeBoardContent,
  parseBoardClubId,
  parseBoardContentBody,
  parseBoardLimit,
  parseBoardPostId,
} from "./validation";

const postId = "123e4567-e89b-42d3-a456-426614174000";
const clubId = "52000000-0000-4000-8000-000000000001";

describe("board content validation", () => {
  it("normalizes CRLF, trims outer whitespace, and keeps internal newlines", () => {
    expect(normalizeBoardContent("  第一行\r\n第二行\r第三行  ")).toBe("第一行\n第二行\n第三行");
  });

  it("counts Unicode code points", () => {
    expect(boardContentLength("😀😀")).toBe(2);
    expect(normalizeBoardContent("😀".repeat(BOARD_CONTENT_MAX_CODE_POINTS))).toHaveLength(2000);
  });

  it("rejects empty, whitespace-only, non-string, and over-limit content", () => {
    expect(() => normalizeBoardContent("")).toThrow("invalid_content");
    expect(() => normalizeBoardContent(" \n ")).toThrow("invalid_content");
    expect(() => normalizeBoardContent(null)).toThrow("invalid_content");
    expect(() => normalizeBoardContent({ content: "x" })).toThrow("invalid_content");
    expect(() => normalizeBoardContent("字".repeat(BOARD_CONTENT_MAX_CODE_POINTS + 1))).toThrow("invalid_content");
  });

  it("rejects unknown body fields", () => {
    expect(parseBoardContentBody({ content: "留言" })).toEqual({ content: "留言" });
    expect(() => parseBoardContentBody({ content: "留言", author_app_account_id: postId })).toThrow("invalid_body");
    expect(() => parseBoardContentBody(["留言"])).toThrow("invalid_body");
  });
});

describe("board query validation", () => {
  it("accepts default and bounded limits", () => {
    expect(parseBoardLimit(null)).toBe(20);
    expect(parseBoardLimit("1")).toBe(1);
    expect(parseBoardLimit("50")).toBe(50);
  });

  it("rejects malformed and out-of-range limits", () => {
    for (const value of ["0", "51", "1.5", "-1", "abc"]) {
      expect(() => parseBoardLimit(value)).toThrow("invalid_limit");
    }
  });

  it("requires valid club and post UUIDs", () => {
    expect(parseBoardClubId(clubId)).toBe(clubId);
    expect(parseBoardPostId(postId)).toBe(postId);
    expect(() => parseBoardClubId(null)).toThrow("invalid_club_id");
    expect(() => parseBoardClubId("not-a-uuid")).toThrow("invalid_club_id");
    expect(() => parseBoardPostId("not-a-uuid")).toThrow("invalid_post_id");
  });
});

describe("opaque board cursor", () => {
  it("round-trips the exact versioned cursor shape", () => {
    const encoded = encodeBoardCursor({ v: 1, created_at: "2026-07-27T08:00:00.000Z", id: postId });
    expect(encoded).not.toContain(postId);
    expect(decodeBoardCursor(encoded)).toEqual({ createdAt: "2026-07-27T08:00:00.000Z", id: postId });
  });

  it("rejects malformed, oversized, unknown-field, and unknown-version cursors", () => {
    expect(() => decodeBoardCursor("%%%")).toThrow("invalid_cursor");
    expect(() => decodeBoardCursor("a".repeat(BOARD_CURSOR_MAX_LENGTH + 1))).toThrow("invalid_cursor");
    const unknownField = Buffer.from(JSON.stringify({ v: 1, created_at: "2026-07-27T08:00:00.000Z", id: postId, author: "x" })).toString("base64url");
    expect(() => decodeBoardCursor(unknownField)).toThrow("invalid_cursor");
    const unknownVersion = Buffer.from(JSON.stringify({ v: 2, created_at: "2026-07-27T08:00:00.000Z", id: postId })).toString("base64url");
    expect(() => decodeBoardCursor(unknownVersion)).toThrow("invalid_cursor");
  });
});

describe("mutation request boundary", () => {
  it("accepts JSON media types only", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("application/json; charset=utf-8")).toBe(true);
    expect(isJsonContentType("text/plain")).toBe(false);
  });

  it("accepts same-origin and rejects cross-origin requests", () => {
    expect(isSameOriginMutation({ requestOrigin: "https://app.example", origin: "https://app.example", fetchSite: "same-origin" })).toBe(true);
    expect(isSameOriginMutation({ requestOrigin: "https://app.example", origin: "https://evil.example", fetchSite: "cross-site" })).toBe(false);
    expect(isSameOriginMutation({ requestOrigin: "https://app.example", origin: null, fetchSite: "cross-site" })).toBe(false);
    expect(isSameOriginMutation({ requestOrigin: "https://app.example", origin: null, fetchSite: null })).toBe(false);
  });
});
