import { expect, test } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

function requireCredentials() {
  if (!adminEmail || !adminPassword) {
    throw new Error("E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required for authenticated browser smoke tests.");
  }
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

async function login(page) {
  requireCredentials();
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(adminEmail);
  await page.getByLabel("密碼").fill(adminPassword);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await expect(page.getByRole("heading", { level: 1, name: /平台管理員，您好/u })).toBeVisible();
}

test.describe("社員平台公開與權限邊界", () => {
  test("公開登入、忘記密碼、狀態頁與未登入導向可使用", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1, name: "歡迎回來" })).toBeVisible();
    await expect(page.getByRole("link", { name: "忘記密碼？" })).toBeVisible();
    await expect(page.getByRole("link", { name: "系統狀態" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { level: 1, name: "忘記密碼" })).toBeVisible();
    await expect(page.getByRole("button", { name: "寄送重設連結" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/status");
    await expect(page.getByRole("heading", { level: 1, name: "扶輪管理平台系統狀態" })).toBeVisible();
    await expect(page.getByText("系統正常", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/u);
    await expect(page.getByRole("heading", { level: 1, name: "歡迎回來" })).toBeVisible();
  });
});

test.describe("社員平台登入後核心導覽", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("管理員可開啟功能總覽、會員中心與社員名冊", async ({ page }) => {
    await expect(page.getByRole("link", { name: "功能總覽" }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/features");
    await expect(page.getByRole("heading", { level: 1, name: "扶輪管理平台功能總覽" })).toBeVisible();
    await expect(page.getByText("邀請、密碼與 LINE 身份", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/me");
    await expect(page.getByText("會員中心", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "基本資料" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/directory");
    await expect(page.getByRole("heading", { level: 1, name: "社員名冊" })).toBeVisible();
    await expect(page.getByText("目前沒有可查看的名冊", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("桌面與手機都有可操作的登出入口", async ({ page, isMobile }) => {
    if (isMobile) {
      await expect(page.getByRole("navigation", { name: "行動版導覽" }).getByRole("button", { name: "登出" })).toBeVisible();
    } else {
      await expect(page.locator("aside").getByRole("button", { name: "登出" })).toBeVisible();
    }

    await page.getByRole("button", { name: "登出" }).click();
    await expect(page).toHaveURL(/\/login$/u);
    await expect(page.getByRole("heading", { level: 1, name: "歡迎回來" })).toBeVisible();
  });
});
