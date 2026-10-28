import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const clubId = "a1000000-0000-4000-8000-000000000001";

test("登入後回到分享的議題頁面與社團", async ({ page }) => {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required.");
  const destination = `/topics?clubId=${clubId}&mode=member`;
  await page.goto(destination);
  await expect(page).toHaveURL(/\/login\?/u);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(destination);
  const lineLogin = page.getByRole("link", { name: "使用 LINE 登入" });
  await expect(lineLogin).toBeVisible();
  const lineUrl = new URL((await lineLogin.getAttribute("href")) ?? "", page.url());
  expect(lineUrl.searchParams.get("returnTo")).toBe(destination);

  await page.getByLabel("電子郵件").fill("e2e-shell-ordinary@example.test");
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(new RegExp(`/topics\\?clubId=${clubId}&mode=member`, "u"));
  await expect(page.getByRole("heading", { name: "議題討論" })).toBeVisible();
});
