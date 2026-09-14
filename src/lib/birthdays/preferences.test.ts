import { describe, expect, it } from "vitest";
import { parseBirthdayPreferences } from "./preferences";

const membershipId = "11111111-1111-4111-8111-111111111111";
const clubId = "22222222-2222-4222-8222-222222222222";

function preference() {
  return {
    membership_id: membershipId,
    club_id: clubId,
    club_code: "RC-1",
    club_name: "測試扶輪社",
    has_birth_date: true,
    has_preference: true,
    is_listed: true,
    allow_wishes: true,
  };
}

describe("birthday preference projection", () => {
  it("maps each club's setting without merging the clubs", () => {
    const secondClub = {
      ...preference(),
      membership_id: "33333333-3333-4333-8333-333333333333",
      club_id: "44444444-4444-4444-8444-444444444444",
      club_code: "RC-2",
      club_name: "第二測試社",
      is_listed: false,
      allow_wishes: false,
    };

    expect(parseBirthdayPreferences([preference(), secondClub])).toEqual([
      {
        membershipId,
        clubId,
        clubCode: "RC-1",
        clubName: "測試扶輪社",
        hasBirthDate: true,
        hasPreference: true,
        isListed: true,
        allowWishes: true,
      },
      {
        membershipId: secondClub.membership_id,
        clubId: secondClub.club_id,
        clubCode: "RC-2",
        clubName: "第二測試社",
        hasBirthDate: true,
        hasPreference: true,
        isListed: false,
        allowWishes: false,
      },
    ]);
  });

  it("rejects malformed or oversized data before rendering settings", () => {
    expect(() => parseBirthdayPreferences([{ ...preference(), club_id: "not-a-uuid" }])).toThrow(
      "invalid_birthday_preferences",
    );
    expect(() => parseBirthdayPreferences(Array.from({ length: 101 }, preference))).toThrow(
      "invalid_birthday_preferences",
    );
  });
});
