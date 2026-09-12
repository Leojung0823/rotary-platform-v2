import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("LINE OA Flex message security boundary", () => {
  const action = source("src/app/line-oa-actions.ts");
  const page = source("src/app/(authenticated)/clubs/[clubId]/line-oa/page.tsx");

  it("rechecks club permission and the Flex flag in the server action", () => {
    expect(action).toContain('permission_key === "oa.manage"');
    expect(action).toContain('key: "line_oa_flex_templates_v1"');
    expect(action).toContain('if (!flag.enabled) redirect(errorPath(clubId, "flex_templates_disabled"));');
    expect(action.indexOf('permission_key === "oa.manage"')).toBeLessThan(action.indexOf('key: "line_oa_flex_templates_v1"'));
    expect(action.indexOf('if (!flag.enabled)')).toBeLessThan(action.indexOf("? await deliverClubOaFlex"));
  });

  it("keeps the selected club id in the page and server calls", () => {
    expect(page).toContain('name="clubId" value={clubId}');
    expect(page).toContain('subjectUuid: clubId');
    expect(action).toContain('const clubId = String(formData.get("clubId") ?? "");');
    expect(action).toContain("loadClubOaDispatchContext(clubId)");
  });

  it("does not accept caller supplied Flex JSON, actions, or remote images", () => {
    expect(action).not.toContain("JSON.parse");
    expect(action).not.toContain("contents");
    expect(source("src/lib/line/flex-templates.ts")).not.toContain('"action"');
    expect(source("src/lib/line/flex-templates.ts")).not.toContain('"image"');
  });
});
