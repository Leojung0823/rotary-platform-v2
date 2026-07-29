import { describe, expect, it } from "vitest";
import { normalizeScannedCheckinToken } from "./scan";

describe("normalizeScannedCheckinToken", () => {
  it("accepts a 64-character hexadecimal token and normalizes case", () => {
    const token = "A1".repeat(32);
    expect(normalizeScannedCheckinToken(`  ${token}\n`)).toBe(token.toLowerCase());
  });

  it("rejects URLs, arbitrary QR payloads, wrong lengths, and non-string values", () => {
    expect(normalizeScannedCheckinToken("https://example.test/checkin?token=" + "a".repeat(64))).toBeNull();
    expect(normalizeScannedCheckinToken("社員簽到")).toBeNull();
    expect(normalizeScannedCheckinToken("a".repeat(63))).toBeNull();
    expect(normalizeScannedCheckinToken("g".repeat(64))).toBeNull();
    expect(normalizeScannedCheckinToken(null)).toBeNull();
  });
});
