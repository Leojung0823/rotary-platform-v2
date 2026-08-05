import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }

describe("member-first information architecture", () => {
  const shell = source("components/app-shell.tsx");
  const styles = source("app/globals.css");
  const dashboard = source("app/(authenticated)/dashboard/page.tsx");
  const login = source("app/login/page.tsx");
  const eventDetail = source("app/(authenticated)/events/[eventId]/page.tsx");
  const unsavedForm = source("components/unsaved-changes-form.tsx");
  const nextConfig = source("../next.config.ts");

  it("keeps exactly four member navigation destinations and a separate management mode", () => {
    const memberItemsBlock = shell.slice(shell.indexOf("const memberItems"), shell.indexOf("function MemberIcon"));
    const memberItems = memberItemsBlock.slice(memberItemsBlock.indexOf("= [") + 3, memberItemsBlock.lastIndexOf("];"));
    expect(memberItems.match(/\{ href:/g)).toHaveLength(4);
    for (const label of ["首頁", "活動", "社員", "我的"]) expect(memberItems).toContain(`label: "${label}"`);
    for (const removed of ["功能總覽", "平台管理", "登出"]) expect(memberItems).not.toContain(removed);
    expect(shell).toContain("目前為管理模式");
    expect(shell).toContain("目前為平台管理模式");
    expect(shell).toContain("返回社員首頁");
    expect(shell).toContain("社務管理選單");
    expect(shell).toContain("平台管理選單");
  });

  it("uses a fixed four-column mobile navigation and senior-friendly targets", () => {
    expect(styles).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(styles).toContain(".mobile-nav a { min-width: 0; min-height: 58px");
    expect(styles).toContain("body { font-size: 18px; }");
    expect(styles).toContain(".button { display: inline-flex; min-height: 48px");
    expect(styles).toContain(".input { width: 100%; min-height: 48px");
    expect(nextConfig).toContain('geolocation=(self)');
    expect(nextConfig).not.toContain('geolocation=()');
  });

  it("makes the home page task-first and omits product-development status", () => {
    for (const required of ["現在需要處理", "下一場活動", "我的報名", "最新公告", "常用功能"]) expect(dashboard).toContain(required);
    for (const removed of ["下一階段", "V0.7", "Hosted Supabase", "功能地圖", "帳號角色", "開發中"]) expect(dashboard).not.toContain(removed);
  });

  it("keeps login focused on LINE, email fallback, and help", () => {
    expect(login).toContain("使用 LINE 登入");
    expect(login).toContain("使用電子郵件登入");
    expect(login).toContain("登入遇到問題？");
    for (const removed of ["多社管理", "稽核紀錄", "系統狀態", "PLATFORM V2"]) expect(login).not.toContain(removed);
  });

  it("confirms completed registration and protects unsaved profile changes", () => {
    expect(eventDetail).toContain("報名完成");
    expect(eventDetail).toContain("加入行事曆");
    expect(eventDetail).toContain("取消報名");
    expect(unsavedForm).toContain('window.addEventListener("beforeunload"');
    expect(unsavedForm).toContain('document.addEventListener("click", warnLinkNavigation, true)');
    expect(unsavedForm).toContain("尚有未儲存的修改");
    expect(source("app/(authenticated)/me/profile/page.tsx")).toContain('name="avatar"');
  });
});
