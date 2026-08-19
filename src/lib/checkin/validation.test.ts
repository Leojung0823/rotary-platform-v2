import { describe, expect, it } from "vitest";
import {
  parseCheckinCoordinates,
  parseCheckinDuration,
  parseCheckinReason,
  parseCheckinToken,
  parseCheckinUuid,
} from "./validation";

describe("check-in validation", () => {
  it("accepts UUIDs and rejects malformed identifiers", () => {
    expect(parseCheckinUuid("86000000-0000-4000-8000-000000000001")).toBe("86000000-0000-4000-8000-000000000001");
    expect(() => parseCheckinUuid("../../other-club")).toThrow("invalid_uuid");
  });

  it("limits session duration to 5 through 240 minutes", () => {
    expect(parseCheckinDuration("30")).toBe(30);
    expect(() => parseCheckinDuration("4")).toThrow("invalid_checkin_duration");
    expect(() => parseCheckinDuration("241")).toThrow("invalid_checkin_duration");
    expect(() => parseCheckinDuration("30.5")).toThrow("invalid_checkin_duration");
  });

  it("accepts geolocation coordinates and rejects out-of-domain or malformed values", () => {
    expect(parseCheckinCoordinates("25.033964", "121.564468")).toEqual({
      latitude: 25.033964,
      longitude: 121.564468,
    });
    expect(parseCheckinCoordinates("-33.8688", "-151.2093")).toEqual({
      latitude: -33.8688,
      longitude: -151.2093,
    });
    expect(() => parseCheckinCoordinates("91", "121.5")).toThrow("invalid_checkin_location");
    expect(() => parseCheckinCoordinates("25.03", "181")).toThrow("invalid_checkin_location");
    expect(() => parseCheckinCoordinates("", "121.5")).toThrow("invalid_checkin_location");
    expect(() => parseCheckinCoordinates(null, null)).toThrow("invalid_checkin_location");
    expect(() => parseCheckinCoordinates("25.03,121.5", "121.5")).toThrow("invalid_checkin_location");
    expect(() => parseCheckinCoordinates("NaN", "121.5")).toThrow("invalid_checkin_location");
  });

  it("normalizes a 64-character lowercase hexadecimal token", () => {
    const token = "A".repeat(64);
    expect(parseCheckinToken(token)).toBe("a".repeat(64));
    expect(() => parseCheckinToken("a".repeat(63))).toThrow("invalid_checkin_token");
    expect(() => parseCheckinToken("z".repeat(64))).toThrow("invalid_checkin_token");
  });

  it("requires a bounded management reason", () => {
    expect(parseCheckinReason(" 現場核對社員名冊 ")).toBe("現場核對社員名冊");
    expect(() => parseCheckinReason("   ")).toThrow("invalid_checkin_reason");
    expect(() => parseCheckinReason("x".repeat(501))).toThrow("invalid_checkin_reason");
  });
});
