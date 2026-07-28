import { describe, expect, it } from "vitest";
import {
  parseEventResponse,
  parseEventText,
  parseEventType,
  parseGuestCount,
  parseOptionalCapacity,
  parseTaipeiDateTime,
} from "./validation";

describe("event validation", () => {
  it("accepts published event types and rejects unknown values", () => {
    expect(parseEventType("regular_meeting")).toBe("regular_meeting");
    expect(() => parseEventType("private_party")).toThrow("invalid_event_type");
  });

  it("normalizes text and enforces required and maximum length", () => {
    expect(parseEventText(" 例會 ", 20, true)).toBe("例會");
    expect(() => parseEventText("   ", 20, true)).toThrow("invalid_event_text");
    expect(() => parseEventText("12345", 4)).toThrow("invalid_event_text");
  });

  it("converts a valid Taipei datetime-local value without normalizing invalid dates", () => {
    expect(parseTaipeiDateTime("2026-08-01T18:30")).toBe("2026-08-01T10:30:00.000Z");
    expect(() => parseTaipeiDateTime("2026/08/01 18:30")).toThrow("invalid_event_time");
    expect(() => parseTaipeiDateTime("2026-02-30T18:30")).toThrow("invalid_event_time");
    expect(() => parseTaipeiDateTime("2026-08-01T24:00")).toThrow("invalid_event_time");
  });

  it("validates optional capacity", () => {
    expect(parseOptionalCapacity("")).toBeNull();
    expect(parseOptionalCapacity("120")).toBe(120);
    expect(() => parseOptionalCapacity("0")).toThrow("invalid_event_capacity");
    expect(() => parseOptionalCapacity("1.5")).toThrow("invalid_event_capacity");
  });

  it("allows guests only for an attending response", () => {
    expect(parseEventResponse("attending")).toBe("attending");
    expect(parseGuestCount("2", "attending")).toBe(2);
    expect(parseGuestCount("", "declined")).toBe(0);
    expect(() => parseGuestCount("1", "declined")).toThrow("invalid_guest_count");
  });
});
