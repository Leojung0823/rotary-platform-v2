import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("LINE Rich Menu security boundary", () => {
  const action = source("src/app/line-rich-menu-actions.ts");
  const page = source("src/app/(authenticated)/clubs/[clubId]/line-oa/page.tsx");

  it("authorizes the club before reading the server credential or calling LINE", () => {
    const publishAction = action.slice(action.indexOf("export async function publishLineRichMenuAction"));
    const disableAction = action.slice(action.indexOf("export async function disableLineRichMenuAction"));
    expect(action).toContain('permission_key === "oa.manage"');
    expect(action).toContain('key: "line_rich_menu_v1"');
    expect(action).toContain("readServerSecret");
    expect(action).toContain('supabase.rpc("set_line_oa_rich_menu"');
    expect(action.indexOf('permission_key === "oa.manage"')).toBeLessThan(action.indexOf('key: "line_rich_menu_v1"'));
    expect(publishAction.indexOf('key: "line_rich_menu_v1"')).toBeLessThan(publishAction.indexOf("readAccessToken(account"));
    expect(publishAction.indexOf("readAccessToken(account")).toBeLessThan(publishAction.indexOf("publishMemberRichMenu"));
    expect(action).toContain("return readServerSecret(account.access_token_env_key");
    expect(disableAction).toContain('key: "line_rich_menu_v1"');
    expect(disableAction.indexOf('key: "line_rich_menu_v1"')).toBeLessThan(disableAction.indexOf("readAccessToken(account"));
  });

  it("does not accept a browser-supplied token, URL, or arbitrary menu JSON", () => {
    expect(action).not.toContain('formData.get("accessToken")');
    expect(action).not.toContain('formData.get("siteUrl")');
    expect(action).not.toContain("JSON.parse");
    expect(action).not.toContain("sendLineOaMessage");
    expect(action).not.toContain("oa-dispatch");
  });

  it("keeps the selected club and feature gate in the management page", () => {
    expect(page).toContain('key: "line_rich_menu_v1"');
    expect(page).toContain('name="clubId" value={clubId}');
    expect(page).toContain("publishLineRichMenuAction");
    expect(page).toContain("disableLineRichMenuAction");
  });
});
