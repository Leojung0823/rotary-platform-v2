import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("blessing IOU collection API boundary", () => {
  const collectionRoute = source("src/app/api/v1/blessing-iou/collections/route.ts");
  const itemRoute = source("src/app/api/v1/blessing-iou/collections/[collectionId]/route.ts");
  const http = source("src/lib/blessing-iou/http.ts");

  it("requires authentication and same-origin protection for every mutation", () => {
    expect(collectionRoute).toContain("authenticatedBlessingIouClient");
    expect(collectionRoute).toContain("blessingIouMutationAllowed(request)");
    expect(itemRoute).toContain("blessingIouMutationAllowed(request)");
    expect(http).toContain('"Cache-Control": "no-store"');
  });

  it("uses protected RPCs without raw table or database-error exposure", () => {
    for (const route of [collectionRoute, itemRoute]) {
      expect(route).toContain(".rpc(");
      expect(route).not.toContain(".from(");
      expect(route).not.toContain("error.message");
    }
  });
});

describe("blessing IOU collection presentation boundary", () => {
  const management = source("src/components/blessing-iou/blessing-iou-collections.tsx");
  const publicWall = source("src/components/blessing-iou/blessing-wall.tsx");

  it("keeps collection states on the management surface only", () => {
    expect(management).toContain("部分收款");
    expect(management).toContain("沖銷");
    expect(publicWall).not.toMatch(/collectionStatus|receivedAmount|outstandingAmount/u);
    expect(publicWall).not.toMatch(/收款狀態|已收清|部分收款/u);
  });

  it("makes corrections explicit rather than deleting receipt history", () => {
    expect(management).toContain("原收款紀錄會保留");
    expect(management).toContain('method: "PATCH"');
    expect(management).not.toMatch(/collections.*method:\s*"DELETE"/u);
  });
});
