import { describe, expect, it } from "vitest";
import {
  canTransitionAnnouncement,
  isSafeAnnouncementActionPath,
  parseAnnouncementAudiences,
  parseAnnouncementBody,
  parseAnnouncementTitle,
  requireConfirmed,
  validateAnnouncementTimes,
} from "./validation";

describe("announcement input and lifecycle", () => {
  it("bounds title and body", () => {
    expect(parseAnnouncementTitle(" 公告 ")).toBe("公告");
    expect(parseAnnouncementBody(" 內容 ")).toBe("內容");
    expect(() => parseAnnouncementTitle(" ")).toThrow("invalid");
    expect(() => parseAnnouncementBody("x".repeat(12_001))).toThrow("invalid");
  });

  it("validates audience types without accepting account identity", () => {
    const all = new FormData(); all.set("audienceType", "all_active_members");
    expect(parseAnnouncementAudiences(all)).toEqual([{ type: "all_active_members" }]);
    const role = new FormData(); role.set("audienceType", "role"); role.set("roleKey", "member");
    expect(parseAnnouncementAudiences(role)).toEqual([{ type: "role", role_key: "member" }]);
    const invalid = new FormData(); invalid.set("audienceType", "account");
    expect(() => parseAnnouncementAudiences(invalid)).toThrow("audience_invalid");
  });

  it("validates publish, expiry, and pin times", () => {
    const now = Date.parse("2026-08-01T00:00:00Z");
    expect(() => validateAnnouncementTimes("2026-08-02T00:00:00Z", "2026-08-03T00:00:00Z", "2026-08-02T00:00:00Z", now)).not.toThrow();
    expect(() => validateAnnouncementTimes("2026-07-31T00:00:00Z", null, null, now)).toThrow("time_invalid");
    expect(() => validateAnnouncementTimes("2026-08-02T00:00:00Z", "2026-08-01T12:00:00Z", null, now)).toThrow("time_invalid");
  });

  it("enforces legal status transitions and explicit confirmation", () => {
    expect(canTransitionAnnouncement("draft", "published")).toBe(true);
    expect(canTransitionAnnouncement("published", "draft")).toBe(false);
    expect(canTransitionAnnouncement("archived", "published")).toBe(false);
    expect(() => requireConfirmed("no")).toThrow("confirmation_required");
    expect(() => requireConfirmed("yes")).not.toThrow();
  });

  it("accepts only internal safe action paths", () => {
    expect(isSafeAnnouncementActionPath("/announcements/abc")).toBe(true);
    expect(isSafeAnnouncementActionPath("//evil.example")).toBe(false);
    expect(isSafeAnnouncementActionPath("/announcements/a b")).toBe(false);
  });
});

