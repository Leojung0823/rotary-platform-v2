import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("blessing IOU rendering boundary", () => {
  const component = source("src/components/blessing-iou/blessing-wall.tsx");
  const css = source("src/components/blessing-iou/blessing-wall.module.css");

  it("renders blessings as escaped React text and restricts avatar protocols", () => {
    expect(component).toContain("{entry.blessingText}");
    expect(component).not.toContain("dangerouslySetInnerHTML");
    expect(component).not.toMatch(/href=\{entry\.blessingText\}|src=\{entry\.blessingText\}/u);
    expect(component).toContain('url.protocol === "https:" || url.protocol === "http:"');
    expect(css).toContain("white-space: pre-wrap");
  });

  it("never displays a payment state on the club-visible wall", () => {
    expect(component).not.toMatch(/paid|payment_status|收款狀態|已收款/u);
  });
});

describe("blessing IOU API boundary", () => {
  const collectionRoute = source("src/app/api/v1/blessing-iou/entries/route.ts");
  const itemRoute = source("src/app/api/v1/blessing-iou/entries/[entryId]/route.ts");
  const settingsRoute = source("src/app/api/v1/blessing-iou/settings/route.ts");
  const http = source("src/lib/blessing-iou/http.ts");

  it("requires authentication, same-origin mutations, and no-store responses", () => {
    expect(collectionRoute).toContain("authenticatedBlessingIouClient");
    expect(collectionRoute).toContain("blessingIouMutationAllowed(request)");
    expect(itemRoute.match(/blessingIouMutationAllowed\(request\)/gu)).toHaveLength(2);
    expect(settingsRoute).toContain("blessingIouMutationAllowed(request)");
    expect(http).toContain('"Cache-Control": "no-store"');
  });

  it("uses only server-authoritative RPCs and never returns raw database errors", () => {
    for (const route of [collectionRoute, itemRoute, settingsRoute]) {
      expect(route).toContain(".rpc(");
      expect(route).not.toContain(".from(");
      expect(route).not.toContain("error.message");
    }
    expect(http).toContain('{ error: "request_failed" }');
  });
});

describe("blessing IOU homepage performance boundary", () => {
  const dashboard = source("src/app/(authenticated)/dashboard/page.tsx");
  const memberHome = source("src/components/member-home.tsx");

  it("adds only a static link and does not load blessing data on the homepage", () => {
    expect(memberHome).toContain("/blessings?clubId=");
    expect(memberHome).not.toContain("list_blessing_iou_entries");
    expect(memberHome).not.toContain("/api/v1/blessing-iou/entries");
    expect(dashboard).not.toContain("list_blessing_iou_entries");
  });
});
