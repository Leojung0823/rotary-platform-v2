import { describe, expect, it } from "vitest";
import { parseRotaryYearStart } from "./reporting-validation";

describe("Rotary-year input", () => {
  it("accepts the first calendar year of a Rotary year", () => {
    expect(parseRotaryYearStart("2026")).toBe(2026);
  });

  it("rejects partial, decimal, and out-of-range years", () => {
    for (const value of ["26", "2026.5", "1999", "9999", 2026, null]) {
      expect(() => parseRotaryYearStart(value)).toThrow();
    }
  });
});
