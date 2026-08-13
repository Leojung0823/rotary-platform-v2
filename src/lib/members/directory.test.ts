import { describe, expect, it } from "vitest";
import {
  directoryRoleLabel,
  parseDirectoryClubs,
  parseDirectoryMember,
  parseDirectoryMembers,
  parseDirectoryUuid,
} from "./directory";

const clubId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";

describe("member directory parsing", () => {
  it("accepts valid clubs and drops malformed rows", () => {
    expect(parseDirectoryClubs([
      { club_id: clubId, club_code: "RC-A", club_name: "測試扶輪社" },
      { club_id: "bad", club_code: "RC-B", club_name: "錯誤資料" },
    ])).toEqual([{ club_id: clubId, club_code: "RC-A", club_name: "測試扶輪社" }]);
  });

  it("preserves only the privacy-filtered projection fields", () => {
    expect(parseDirectoryMembers([{
      membership_id: membershipId,
      display_name: "王小明",
      avatar_url: null,
      role_key: "secretary",
      occupation: "會計師",
      email: "member@example.test",
      phone: null,
      birth_year: 1985,
      is_self: false,
      person_id: "must-not-project",
    }])).toEqual([{
      membership_id: membershipId,
      display_name: "王小明",
      avatar_url: null,
      role_key: "secretary",
      occupation: "會計師",
      email: "member@example.test",
      phone: null,
      birth_year: 1985,
      is_self: false,
    }]);
  });

  it("rejects malformed member projections", () => {
    expect(parseDirectoryMember({
      membership_id: membershipId,
      display_name: "王小明",
      avatar_url: null,
      role_key: "platform_admin",
      occupation: null,
      email: null,
      phone: null,
      birth_year: null,
      is_self: false,
    })).toBeNull();
  });

  it("validates UUIDs and translates role labels", () => {
    expect(parseDirectoryUuid(clubId.toUpperCase())).toBe(clubId);
    expect(() => parseDirectoryUuid("not-a-uuid")).toThrow("invalid_directory_uuid");
    expect(directoryRoleLabel("president")).toBe("社長");
  });
});
