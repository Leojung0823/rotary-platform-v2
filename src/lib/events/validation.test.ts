import { describe, expect, it } from "vitest";
import {
  initialEventCreateFormValues,
  parseEventResponse,
  parseEventText,
  parseEventType,
  parseGuestCount,
  parseOptionalCapacity,
  parseTaipeiDateTime,
  validateEventCreateForm,
} from "./validation";

function createValues(overrides: Partial<typeof initialEventCreateFormValues> = {}) {
  return {
    ...initialEventCreateFormValues,
    title: "週三例會",
    startsAt: "2026-08-20T18:30",
    endsAt: "2026-08-20T20:30",
    registrationDeadline: "2026-08-19T18:30",
    location: "扶輪會館",
    description: "請準時出席",
    ...overrides,
  };
}

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

  it("returns actionable field errors for a create form without discarding its values", () => {
    const values = createValues({ title: "", capacity: "0", countsForAttendance: false });
    const validation = validateEventCreateForm(values);

    expect(validation).toEqual({
      ok: false,
      fieldErrors: {
        title: "請輸入活動名稱。",
        capacity: "名額必須是 1 至 10000 的整數，或留空表示不限。",
      },
    });
    expect(values).toMatchObject({
      startsAt: "2026-08-20T18:30",
      endsAt: "2026-08-20T20:30",
      countsForAttendance: false,
      description: "請準時出席",
    });
  });

  it("maps invalid datetime and chronology rules to the affected fields", () => {
    const invalidDate = validateEventCreateForm(createValues({ startsAt: "not-a-date" }));
    expect(invalidDate).toEqual({
      ok: false,
      fieldErrors: { startsAt: "請輸入有效的開始日期與時間。" },
    });

    const invalidEnd = validateEventCreateForm(createValues({ endsAt: "2026-08-20T18:30" }));
    expect(invalidEnd).toEqual({
      ok: false,
      fieldErrors: { endsAt: "結束時間必須晚於開始時間。" },
    });

    const invalidDeadline = validateEventCreateForm(createValues({ registrationDeadline: "2026-08-20T18:31" }));
    expect(invalidDeadline).toEqual({
      ok: false,
      fieldErrors: { registrationDeadline: "報名截止時間不得晚於活動開始時間。" },
    });
  });

  it("keeps an empty optional capacity as unlimited", () => {
    const validation = validateEventCreateForm(createValues({ capacity: "" }));
    expect(validation).toMatchObject({ ok: true, input: { capacity: null } });
  });
});
