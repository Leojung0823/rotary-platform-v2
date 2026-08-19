import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("blessing IOU reporting API boundary", () => {
  const route = source("src/app/api/v1/blessing-iou/reports/rotary-year/route.ts");
  const http = source("src/lib/blessing-iou/http.ts");

  it("requires authentication, protected RPC projection, and no-store", () => {
    expect(route).toContain("authenticatedBlessingIouClient");
    expect(route).toContain('client.rpc("get_blessing_iou_rotary_year_report"');
    expect(route).not.toContain(".from(");
    expect(route).not.toContain("error.message");
    expect(http).toContain('"Cache-Control": "no-store"');
  });
});

describe("blessing IOU reporting presentation boundary", () => {
  const page = source("src/app/(authenticated)/clubs/[clubId]/blessing-iou/reports/page.tsx");
  const report = source("src/components/blessing-iou/blessing-iou-report.tsx");

  it("fails closed behind both core and reporting flags", () => {
    expect(page).toContain('key: "blessing_iou_v1"');
    expect(page).toContain('key: "blessing_iou_reporting_v1"');
    expect(page).toContain("notFound()");
  });

  it("shows only aggregates and not blessing content or contact fields", () => {
    expect(report).toContain("report.summary");
    expect(report).toContain("report.months");
    expect(report).toContain("report.members");
    expect(report).not.toMatch(/blessingText|email|phone|avatar/u);
  });
});
