import { expect, test } from "@playwright/test";

test("checkin_qr_v2 disabled retains the legacy check-in entry path", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill("e2e-shell-ordinary@example.test");
  await page.getByLabel("密碼").fill(process.env.E2E_ROLE_PASSWORD ?? "");
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await page.goto("/events/checkin");
  await expect(page.getByLabel("簽到 token")).toBeVisible();
  await expect(page.getByRole("heading", { name: "手動輸入簽到 token" })).toBeVisible();
});
