import { expect, test } from "@playwright/test";

const email = process.env.E2E_ADMIN_EMAIL;
const password = process.env.E2E_ADMIN_PASSWORD;

test("FORCE_LEGACY_ROLE_SHELLS keeps the complete legacy shell", async ({ page }) => {
  if (!email || !password) throw new Error("E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required.");
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await expect(page.getByRole("link", { name: "功能總覽" }).first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "切換工作模式" })).toHaveCount(0);
});
