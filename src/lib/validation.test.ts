import { describe, expect, it } from "vitest";
import { isPlausibleBirthDate, isValidClubName, mapDatabaseError, parseClubInput, parseMemberInput, parseNewPassword, parseOperatorInput, safeMessage, safeRedirectPath, taipeiToday } from "./validation";

function form(values: Record<string, string>) { const data = new FormData(); Object.entries(values).forEach(([key, value]) => data.set(key, value)); return data; }

describe("club input validation", () => {
  it("normalizes safe club and operator values", () => {
    expect(parseClubInput(form({ clubCode: " taipei-north ", clubName: " 台北北區扶輪社 ", operatorEmail: " Admin@Example.COM ", operatorName: " 王秘書 ", operatorPassword: "a-secure-local-password", operatorPasswordConfirmation: "a-secure-local-password" }))).toEqual({ clubCode: "TAIPEI-NORTH", clubName: "台北北區扶輪社", operatorEmail: "admin@example.com", operatorName: "王秘書", operatorPassword: "a-secure-local-password" });
  });
  it("rejects malformed input", () => {
    expect(() => parseClubInput(form({ clubCode: "!", clubName: "A", operatorEmail: "bad", operatorName: "A" }))).toThrow("invalid_club_code");
    expect(() => parseOperatorInput(form({ email: "not-an-email", displayName: "王秘書" }))).toThrow("invalid_email");
  });
  it("rejects control characters from club names", () => {
    expect(isValidClubName("台北扶輪社")).toBe(true);
    expect(isValidClubName("A")).toBe(false);
    expect(isValidClubName(`台北\n扶輪社`)).toBe(false);
    expect(isValidClubName("x".repeat(101))).toBe(false);
  });
  it("requires matching twelve-character invitation passwords", () => {
    expect(parseNewPassword(form({ password: "a-secure-local-password", passwordConfirmation: "a-secure-local-password" }))).toBe("a-secure-local-password");
    expect(() => parseNewPassword(form({ password: "too-short", passwordConfirmation: "too-short" }))).toThrow("invalid_password");
  });
  it("keeps known member data and allows a name with no contact method", () => {
    expect(parseMemberInput(form({ name: " 林社員 ", phone: "0912345678", email: "", birthDate: "1980-02-03" }))).toEqual({ name: "林社員", phone: "0912345678", email: "", birthDate: "1980-02-03" });
    expect(parseMemberInput(form({ name: "Nick", phone: "", email: "", birthDate: "" }))).toEqual({ name: "Nick", phone: "", email: "", birthDate: null });
  });
});

describe("safe error and redirect handling", () => {
  it("maps database details to stable UI codes", () => {
    expect(mapDatabaseError("active_member_cannot_be_operator")).toBe("member_conflict");
    // The pairing failure has to survive the generic rules that follow it:
    // "required" and "P0002" would both turn it into a message that does not
    // tell an officer to save the OA settings first.
    expect(mapDatabaseError("oa_or_member_not_found")).toBe("oa_or_member_not_found");
    expect(safeMessage("oa_or_member_not_found")).toContain("OA 設定");
    expect(mapDatabaseError("cannot_revoke_last_active_operator")).toBe("last_operator");
    expect(mapDatabaseError("account_not_in_club")).toBe("line_unbind_membership_mismatch");
    expect(mapDatabaseError("invalid_club_name")).toBe("invalid_club_name");
  });
  it("explains how to finish an already-bound LINE invitation", () => {
    expect(safeMessage("line_login_no_active_access")).toContain("最新重發的邀請連結");
  });
  it("explains how to resolve a duplicated LINE member record", () => {
    expect(safeMessage("line_invitation_identity_conflict")).toContain("原社員紀錄");
  });
  it("explains a LINE unbind membership mismatch", () => {
    expect(safeMessage("line_unbind_membership_mismatch")).toContain("社籍資料");
  });
  it("blocks external and protocol-relative redirects", () => {
    expect(safeRedirectPath("/invite/accept")).toBe("/invite/accept");
    expect(safeRedirectPath("//evil.example", "/login")).toBe("/login");
    expect(safeRedirectPath("https://evil.example", "/login")).toBe("/login");
  });
});

describe("birth date plausibility", () => {
  const now = new Date("2026-08-21T12:00:00Z");

  it("accepts a real past date and today in Taipei", () => {
    expect(isPlausibleBirthDate("1980-02-03", now)).toBe(true);
    expect(isPlausibleBirthDate("1900-01-01", now)).toBe(true);
    expect(isPlausibleBirthDate(taipeiToday(now), now)).toBe(true);
  });

  it("rejects the range the database rejects, instead of leaving it to fail there", () => {
    expect(isPlausibleBirthDate("2027-01-01", now)).toBe(false);
    expect(isPlausibleBirthDate("1899-12-31", now)).toBe(false);
  });

  it("rejects dates the calendar does not have", () => {
    expect(isPlausibleBirthDate("1990-02-30", now)).toBe(false);
    expect(isPlausibleBirthDate("1990-13-01", now)).toBe(false);
    expect(isPlausibleBirthDate("1990-1-1", now)).toBe(false);
  });

  it("uses the Taipei day, so an evening birthday is not called a future date", () => {
    // 2026-08-21 08:00 Taipei is still 2026-08-20 in UTC.
    expect(isPlausibleBirthDate("2026-08-21", new Date("2026-08-21T00:30:00Z"))).toBe(true);
  });

  it("is enforced by the shared member parser", () => {
    expect(() => parseMemberInput(form({
      name: "林社員", phone: "0912345678", email: "", birthDate: "2099-01-01",
    }))).toThrow("invalid_birth_date");
  });

  it("still allows a member with a name and no contact details", () => {
    // Secretary-created and invited members legitimately have neither.
    expect(parseMemberInput(form({ name: "Nick", phone: "", email: "", birthDate: "" })))
      .toEqual({ name: "Nick", phone: "", email: "", birthDate: null });
  });
});

describe("self-profile database errors", () => {
  it("names the reason instead of suggesting a transient failure", () => {
    // Six different rules share this one database code, so the message has to
    // list them; what it must not do is say "try again later" for a typo.
    expect(mapDatabaseError("invalid_self_profile_input")).toBe("invalid_profile_input");
    expect(safeMessage("invalid_profile_input")).toContain("生日介於 1900 年與今天之間");
    expect(safeMessage("invalid_profile_input")).not.toContain("稍後再試");
  });
});
