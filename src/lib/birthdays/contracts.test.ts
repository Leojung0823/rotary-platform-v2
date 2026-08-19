import { describe, expect, it } from "vitest";
import { parseBirthdayPageProjection } from "./contracts";

const clubId = "11111111-1111-4111-8111-111111111111";
const membershipId = "22222222-2222-4222-8222-222222222222";
const wishId = "33333333-3333-4333-8333-333333333333";

function projection() {
  return {
    clubs: [{ club_id: clubId, club_code: "RC-1", club_name: "測試扶輪社" }],
    selected_club_id: clubId,
    can_manage: false,
    my_preference: {
      membership_id: membershipId,
      has_birth_date: true,
      is_listed: true,
      allow_wishes: true,
    },
    birthdays: [{
      membership_id: membershipId,
      display_name: "王小明",
      avatar_url: null,
      birth_month: 8,
      birth_day: 20,
      allow_wishes: true,
      is_self: true,
    }],
    wishes: [{
      id: wishId,
      recipient_membership_id: membershipId,
      recipient_name: "王小明",
      author_name: "陳社員",
      content: "生日快樂",
      created_at: "2026-08-20T00:00:00.000Z",
      updated_at: "2026-08-20T00:00:00.000Z",
      can_edit: false,
      can_delete: false,
      can_moderate: false,
    }],
  };
}

describe("birthday page projection", () => {
  it("maps the tenant-scoped RPC shape", () => {
    const parsed = parseBirthdayPageProjection(projection());
    expect(parsed.selectedClubId).toBe(clubId);
    expect(parsed.birthdays[0]).toMatchObject({ displayName: "王小明", birthMonth: 8, birthDay: 20 });
    expect(parsed.wishes[0]?.content).toBe("生日快樂");
  });

  it("rejects a selected club outside the returned access list", () => {
    expect(() => parseBirthdayPageProjection({
      ...projection(),
      selected_club_id: "44444444-4444-4444-8444-444444444444",
    })).toThrow("invalid_birthday_projection");
  });

  it("rejects impossible month and day values", () => {
    const value = projection();
    value.birthdays[0]!.birth_month = 13;
    expect(() => parseBirthdayPageProjection(value)).toThrow("invalid_birthday_projection");
  });
});
