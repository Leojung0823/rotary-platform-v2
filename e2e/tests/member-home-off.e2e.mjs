import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;

test("member_home_v2 disabled keeps the existing member landing", async ({ page }) => {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required.");
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill("e2e-shell-ordinary@example.test");
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await expect(page.getByText("目前作用扶輪社", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "今天與我有關的事情" })).toHaveCount(0);
});
