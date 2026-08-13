import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

function requireCredentials() {
  if (!adminEmail || !adminPassword) {
    throw new Error("E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required.");
  }
}

async function login(page, email, password) {
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

test("管理員建立扶輪社時直接設定執行秘書帳密，新帳號可立即登入", async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "直接密碼建置閉環只需在桌面專案執行一次。");
  requireCredentials();

  const suffix = randomUUID().slice(0, 8);
  const clubCode = `E2E-${suffix}`.toUpperCase();
  const clubName = `E2E 邀請驗證扶輪社 ${suffix}`;
  const operatorName = `E2E 執行秘書 ${suffix}`;
  const operatorEmail = `e2e-operator-${suffix}@example.test`;
  const operatorPassword = `Rotary-E2E-${suffix}-Pass!`;

  await login(page, adminEmail, adminPassword);
  await page.goto("/platform/clubs/new");
  await expect(page.getByRole("heading", { level: 1, name: "建立扶輪社" })).toBeVisible();
  await page.getByLabel("扶輪社代碼").fill(clubCode);
  await page.getByLabel("扶輪社名稱").fill(clubName);
  await page.getByLabel("姓名").fill(operatorName);
  await page.getByLabel("電子郵件").fill(operatorEmail);
  await page.getByLabel(/^密碼/u).fill(operatorPassword);
  await page.getByLabel("確認密碼").fill(operatorPassword);
  await page.getByRole("button", { name: "建立並設定帳號" }).click();
  await expect(page).toHaveURL(/\/platform\/clubs\/[0-9a-f-]+\?success=club_created$/u);
  await expect(page.getByRole("heading", { level: 1, name: clubName })).toBeVisible();

  // Use a separate browser context so the new operator never inherits the administrator session.
  const operatorContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const operatorPage = await operatorContext.newPage();
  await login(operatorPage, operatorEmail, operatorPassword);
  await expect(operatorPage.getByText(clubName, { exact: true }).first()).toBeVisible();

  await operatorContext.close();
});
