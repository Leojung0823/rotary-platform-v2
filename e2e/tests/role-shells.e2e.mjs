import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const secondMemberClubId = "a1000000-0000-4000-8000-000000000002";
const managedClubId = "a1000000-0000-4000-8000-000000000003";

const accounts = {
  ordinary: { email: "e2e-shell-ordinary@example.test", mode: "社員模式" },
  multi: { email: "e2e-shell-multi@example.test", mode: "社員模式" },
  memberManager: { email: "e2e-shell-member-manager@example.test", mode: "社員模式" },
  management: { email: "e2e-shell-management@example.test", mode: "社務管理模式" },
  platform: { email: "e2e-shell-platform@example.test", mode: "平台管理模式" },
  platformMember: { email: "e2e-shell-platform-member@example.test", mode: "社員模式" },
  allModes: { email: "e2e-shell-all-modes@example.test", mode: "社員模式" },
};

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for role-shell browser smoke tests.");
}

async function login(page, email) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectShell(page, mode) {
  await expect(page.locator("aside > header > p").first()).toHaveText(mode);
  await expect(page.getByRole("navigation", { name: "主要導覽" })).toBeVisible();
}

test("server-resolved role shell is responsive and remains keyboard accessible", async ({ page, browser }, testInfo) => {
  if (testInfo.project.name === "role-shells-1440") {
    for (const account of Object.values(accounts)) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const rolePage = await context.newPage();
      await login(rolePage, account.email);
      await expectShell(rolePage, account.mode);
      await context.close();
    }

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const rolePage = await context.newPage();
    await login(rolePage, accounts.memberManager.email);
    await expectShell(rolePage, "社員模式");
    const managementMode = rolePage.getByRole("navigation", { name: "切換工作模式" }).getByRole("link", { name: "社務管理模式" });
    await managementMode.focus();
    await rolePage.keyboard.press("Enter");
    await expect(rolePage).toHaveURL(/mode=management/u);
    await expectShell(rolePage, "社務管理模式");
    await rolePage.getByLabel("切換作用扶輪社").focus();
    await rolePage.keyboard.press("Enter");
    await expect(rolePage.getByRole("region", { name: "我的扶輪社" })).toBeVisible();
    await expect(rolePage.getByRole("region", { name: "其他可管理扶輪社" })).toHaveCount(0);

    await rolePage.getByRole("navigation", { name: "切換工作模式" }).getByRole("link", { name: "社員模式" }).click();
    await expectShell(rolePage, "社員模式");
    await context.close();

    const managementContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const managementPage = await managementContext.newPage();
    await login(managementPage, accounts.management.email);
    await managementPage.getByLabel("切換作用扶輪社").focus();
    await managementPage.keyboard.press("Enter");
    await expect(managementPage.getByRole("region", { name: "其他可管理扶輪社" })).toBeVisible();
    await expect(managementPage.getByRole("region", { name: "我的扶輪社" })).toHaveCount(0);
    await managementContext.close();

    const allModesContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const allModesPage = await allModesContext.newPage();
    await login(allModesPage, accounts.allModes.email);
    const modeNavigation = allModesPage.getByRole("navigation", { name: "切換工作模式" });
    await expect(modeNavigation.getByRole("link", { name: "社員模式" })).toBeVisible();
    await expect(modeNavigation.getByRole("link", { name: "社務管理模式" })).toBeVisible();
    await expect(modeNavigation.getByRole("link", { name: "平台管理模式" })).toBeVisible();
    await allModesContext.close();
    return;
  }

  await login(page, accounts.ordinary.email);
  await expect(page.getByRole("navigation", { name: "主要導覽" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主要導覽" })).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "主要導覽" }).getByRole("link", { name: "首頁" })).toHaveAttribute("aria-current", "page");
  const skipLink = page.getByRole("link", { name: "跳至主要內容" });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("navigation", { name: "主要導覽" }).getByRole("link", { name: "活動" })).toBeVisible();

  if (testInfo.project.name === "role-shells-320") await expectNoHorizontalOverflow(page);
  if (testInfo.project.name === "role-shells-768") {
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await expect(page.getByRole("navigation", { name: "主要導覽" }).getByRole("link", { name: "我的" })).toBeVisible();
  }
  if (["role-shells-412", "role-shells-375", "role-shells-320"].includes(testInfo.project.name)) {
    await expect(page.getByRole("navigation", { name: "主要導覽" }).getByRole("link", { name: "簽到" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "主要導覽" }).getByRole("link", { name: "名錄" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "主要導覽" }).getByRole("link", { name: "我的" })).toBeVisible();
  }
});

test("mode, active-club cookie, and deep links remain bounded UX inputs", async ({ page, browser }, testInfo) => {
  if (testInfo.project.name !== "role-shells-1440") {
    await login(page, accounts.ordinary.email);
    await expect(page.getByRole("navigation", { name: "主要導覽" })).toBeVisible();
    return;
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const rolePage = await context.newPage();
  await context.addCookies([{
    name: "rotary_active_club_v1",
    value: "00000000-0000-4000-8000-000000000099",
    url: new URL("/", process.env.E2E_BASE_URL ?? "http://localhost:3000").toString(),
  }]);
  await login(rolePage, accounts.ordinary.email);
  await rolePage.getByLabel("切換作用扶輪社").click();
  await expect(rolePage.getByRole("button", { name: /^本機 Shell 社員社 E2E-SHELL-MEMBER/u })).toBeVisible();
  await rolePage.goto(new URL("/dashboard?mode=platform", baseURL).toString());
  await expectShell(rolePage, "社員模式");
  await rolePage.goto(new URL(`/clubs/${managedClubId}/members?mode=management`, baseURL).toString());
  await expect(rolePage).toHaveURL(new RegExp(`/clubs/${managedClubId}/members`, "u"));
  await context.close();

  const multiContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const multiPage = await multiContext.newPage();
  await login(multiPage, accounts.multi.email);
  await multiPage.goto(new URL(`/club/${secondMemberClubId}?mode=member`, baseURL).toString());
  await expect(multiPage).toHaveURL(new RegExp(`/club/${secondMemberClubId}`, "u"));
  await expect(multiPage.getByRole("heading", { name: "本機 Shell 第二社" })).toBeVisible();
  await multiContext.close();
});

test("revoked and suspended identities do not receive a role shell", async ({ page }, testInfo) => {
  const email = testInfo.project.name === "role-shells-1440"
    ? "e2e-shell-revoked@example.test"
    : "e2e-shell-suspended@example.test";
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/access-denied/u);
  await expect(page.getByRole("navigation", { name: "主要導覽" })).toHaveCount(0);
});
