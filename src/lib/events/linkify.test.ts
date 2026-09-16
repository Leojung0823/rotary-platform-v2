import { describe, expect, it } from "vitest";
import { linkifySegments } from "./linkify";

function hrefs(text: string) {
  return linkifySegments(text).filter((s) => s.kind === "link").map((s) => s.href);
}

function rebuilt(text: string) {
  return linkifySegments(text).map((s) => s.value).join("");
}

describe("a link in a description becomes a link", () => {
  it("finds a plain https url", () => {
    expect(hrefs("報名表單：https://example.com/form")).toEqual(["https://example.com/form"]);
  });

  it("finds more than one", () => {
    expect(hrefs("http://a.test 與 https://b.test/x")).toEqual(["http://a.test/", "https://b.test/x"]);
  });

  it("leaves the sentence intact around it", () => {
    // The whole point of segments: nothing may be dropped or reordered.
    for (const text of [
      "報名表單：https://example.com/form，請於週五前填寫。",
      "沒有網址的說明",
      "https://example.com 開頭就是網址",
      "",
    ]) {
      expect(rebuilt(text)).toBe(text);
    }
  });
});

describe("what does not become a link", () => {
  // Turning organiser-typed text into a tappable link decides where a member's
  // tap goes. Only the two schemes that cannot execute anything qualify.
  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "www.example.com",
    "example.com",
  ])("leaves %s as text", (text) => {
    expect(hrefs(`請看 ${text} 謝謝`)).toEqual([]);
  });

  it("does not smuggle a scheme through a wrapped url", () => {
    expect(hrefs("https://example.com/?next=javascript:alert(1)")
      .every((href) => href.startsWith("https://"))).toBe(true);
  });
});

describe("the boundary of a url is where the sentence resumes", () => {
  it("does not swallow Chinese punctuation", () => {
    expect(hrefs("詳見 https://example.com/x。")).toEqual(["https://example.com/x"]);
    expect(hrefs("詳見 https://example.com/x，然後")).toEqual(["https://example.com/x"]);
  });

  it("does not swallow a trailing full stop or comma", () => {
    expect(hrefs("see https://example.com/x.")).toEqual(["https://example.com/x"]);
    expect(hrefs("see https://example.com/x, then")).toEqual(["https://example.com/x"]);
  });

  it("keeps brackets the url itself opened", () => {
    expect(hrefs("https://example.com/a_(b)")).toEqual(["https://example.com/a_(b)"]);
  });

  it("drops a bracket the sentence opened", () => {
    expect(hrefs("（https://example.com/x）")).toEqual(["https://example.com/x"]);
  });
});
