import { describe, expect, it } from "vitest";
import { formatEventClockRange, formatEventTimeRange, isSameTaipeiDay } from "./event-time";

// 18:30–20:30 Taipei on 2026-09-17 is 10:30–12:30 UTC.
const eveningStart = "2026-09-17T10:30:00.000Z";
const eveningEnd = "2026-09-17T12:30:00.000Z";
// 22:00 Taipei on 2026-09-17 to 01:00 Taipei on 2026-09-18.
const overnightStart = "2026-09-17T14:00:00.000Z";
const overnightEnd = "2026-09-17T17:00:00.000Z";

describe("an event that ends the evening it started", () => {
  // Every meeting used to read as though it ran overnight, because the end was
  // printed with its full date whether or not the date had changed.
  it("prints the end as a clock time only", () => {
    const range = formatEventTimeRange(eveningStart, eveningEnd);
    expect(range).toContain("18:30");
    expect(range).toContain("20:30");
    expect(range.match(/2026/gu)).toHaveLength(1);
  });

  it("still says which day it is once", () => {
    expect(formatEventTimeRange(eveningStart, eveningEnd)).toContain("2026/09/17");
  });
});

describe("an event that crosses midnight", () => {
  // The second date is the one thing a bare clock range cannot express:
  // "22:00－01:00" reads backwards.
  it("prints the second date", () => {
    expect(formatEventTimeRange(overnightStart, overnightEnd)).toContain("2026/09/18");
  });

  it("prints it in the clock-only variant too", () => {
    expect(formatEventClockRange(overnightStart, overnightEnd)).toContain("2026/09/18");
  });
});

describe("the day is decided in Taipei, not in the viewer's timezone", () => {
  it("treats a Taipei evening as one day even though it spans UTC midnight", () => {
    // 2026-09-17 23:00 Taipei is 15:00Z; ending 23:30 Taipei is 15:30Z. Both
    // are the 17th in Taipei. An event starting 08:30 Taipei on the 18th is
    // 2026-09-18T00:30Z -- same UTC day as a 17th-evening event's end.
    expect(isSameTaipeiDay("2026-09-17T15:00:00.000Z", "2026-09-17T15:30:00.000Z")).toBe(true);
    expect(isSameTaipeiDay("2026-09-17T15:00:00.000Z", "2026-09-17T16:30:00.000Z")).toBe(false);
  });

  it("does not use the runner's own clock", () => {
    // Asserting on the formatted output rather than Date methods: a machine in
    // UTC and a machine in Taipei must produce the same string.
    expect(formatEventTimeRange(eveningStart, eveningEnd)).toContain("18:30");
  });
});

describe("the clock-only variant is for a layout that shows the date beside it", () => {
  it("omits the date entirely on a same-day event", () => {
    expect(formatEventClockRange(eveningStart, eveningEnd)).toBe("18:30－20:30");
  });
});
