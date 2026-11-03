import { describe, expect, it } from "vitest";
import { withExternalBrowser } from "./external-browser";

describe("LINE external-browser links", () => {
  it("preserves existing query, repeated values and fragments", () => {
    const url = new URL(withExternalBrowser("https://club.example/topics/abc?clubId=1&tag=a&tag=b#vote"));
    expect(url.searchParams.getAll("tag")).toEqual(["a", "b"]);
    expect(url.searchParams.get("clubId")).toBe("1");
    expect(url.searchParams.get("openExternalBrowser")).toBe("1");
    expect(url.hash).toBe("#vote");
  });
  it("leaves LIFF and non-http links unchanged", () => {
    expect(withExternalBrowser("https://liff.line.me/123?a=1")).toBe("https://liff.line.me/123?a=1");
    expect(withExternalBrowser("mailto:member@example.com")).toBe("mailto:member@example.com");
  });
});
