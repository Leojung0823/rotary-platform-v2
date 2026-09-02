import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for member-home browser smoke tests.");
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

test("member home is server-resolved, member-first, and responsive", async ({ page, browser }, testInfo) => {
  if (testInfo.project.name === "member-home-1440") {
    const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const memberPage = await memberContext.newPage();
    await login(memberPage, "e2e-shell-ordinary@example.test");
    await expect(memberPage.getByRole("heading", { name: "加入「本機 Shell 社員社」LINE 官方帳號" })).toBeVisible();
    await expect(memberPage.getByRole("link", { name: "加入本社 LINE" })).toHaveAttribute(
      "href",
      "https://line.me/R/ti/p/%40e2e-rotary",
    );
    await expect(memberPage.getByRole("heading", { name: "今天與我有關的事情" })).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: "本機社員首頁例會" })).toBeVisible();
    await memberPage.getByRole("link", { name: "前往簽到" }).click();
    await expect(memberPage).toHaveURL(/\/events\/checkin/u);
    await memberContext.close();

    const multiContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const multiPage = await multiContext.newPage();
    await login(multiPage, "e2e-shell-multi@example.test");
    await expect(multiPage.getByRole("heading", { name: "今天與我有關的事情" })).toBeVisible();
    await multiPage.getByLabel("切換作用扶輪社").click();
    await multiPage.getByRole("button", { name: /^本機 Shell 第二社 E2E-SHELL-SECOND/u }).click();
    await expect(multiPage.getByText("本機 Shell 第二社", { exact: true })).toBeVisible();
    await multiContext.close();

    const managementContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const managementPage = await managementContext.newPage();
    await login(managementPage, "e2e-shell-management@example.test");
    await expect(managementPage.getByRole("heading", { name: "平台管理工作台" })).toHaveCount(0);
    await expect(managementPage.locator("aside > header > p").first()).toHaveText("社務管理模式");
    await expect(managementPage.getByRole("heading", { name: "今天與我有關的事情" })).toHaveCount(0);
    await managementContext.close();

    const platformContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const platformPage = await platformContext.newPage();
    await login(platformPage, "e2e-shell-platform@example.test");
    await expect(platformPage.getByRole("heading", { name: "平台管理工作台" })).toBeVisible();
    await expect(platformPage.getByRole("heading", { name: "今天與我有關的事情" })).toHaveCount(0);
    await platformContext.close();
    return;
  }

  await login(page, "e2e-shell-ordinary@example.test");
  await expect(page.getByRole("heading", { name: "加入「本機 Shell 社員社」LINE 官方帳號" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今天與我有關的事情" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主要導覽" })).toHaveCount(1);
  if (testInfo.project.name === "member-home-320") await expectNoHorizontalOverflow(page);
  if (testInfo.project.name === "member-home-768") {
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await expect(page.getByRole("link", { name: "前往簽到" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  if (["member-home-412", "member-home-375", "member-home-320"].includes(testInfo.project.name)) {
    await expect(page.getByRole("link", { name: "前往簽到" })).toBeVisible();
  }
});
