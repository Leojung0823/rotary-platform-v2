import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
}

describe("message board rendering boundary", () => {
  const component = source("components/message-board/message-board.tsx");
  const css = source("components/message-board/message-board.module.css");

  it("renders user content as escaped React text with safe line breaks", () => {
    expect(component).toContain("{post.content}");
    expect(component).not.toContain("dangerouslySetInnerHTML");
    expect(component).not.toMatch(/href=\{post\.content\}|src=\{post\.content\}/);
    expect(css).toContain("white-space: pre-wrap");
  });

  it("restricts avatar sources to HTTP(S) and has a fallback", () => {
    expect(component).toContain('url.protocol === "https:" || url.protocol === "http:"');
    expect(component).toContain("onError={() => setFailed(true)}");
  });

  it("keeps script, event-handler, and SVG-looking payloads as ordinary strings", () => {
    for (const payload of ["<script>alert(1)</script>", '<img onerror="alert(1)">', "<svg><script>alert(1)</script></svg>"]) {
      expect(JSON.parse(JSON.stringify({ content: payload })).content).toBe(payload);
    }
  });
});

describe("message board API boundary", () => {
  const collectionRoute = source("app/api/v1/board/posts/route.ts");
  const itemRoute = source("app/api/v1/board/posts/[postId]/route.ts");
  const http = source("lib/message-board/http.ts");

  it("requires authentication and same-origin mutation protection", () => {
    expect(collectionRoute).toContain("authenticatedBoardClient");
    expect(collectionRoute).toContain("mutationAllowed(request)");
    expect(itemRoute.match(/mutationAllowed\(request\)/g)).toHaveLength(2);
    expect(http).toContain('"Cache-Control": "no-store"');
  });

  it("does not return raw Supabase errors", () => {
    expect(collectionRoute).not.toContain("error.message");
    expect(itemRoute).not.toContain("error.message");
    expect(http).toContain('{ error: "request_failed" }');
  });
});
