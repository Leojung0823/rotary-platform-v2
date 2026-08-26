import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const officerEmail = "e2e-shell-member-manager@example.test";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for LINE OA audience browser tests.");
}

async function openLineOa(page) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(officerEmail);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);

  await page.goto(new URL("/dashboard?mode=member", baseURL).toString());
  await page.getByLabel("帳號選單").click();
  await page.getByRole("link", { name: "進入社務管理" }).click();
  await expect(page).toHaveURL(/\/members/u);
  await page.getByRole("link", { name: "LINE OA" }).click();
  await expect(page.getByRole("heading", { name: "LINE Official Account" })).toBeVisible();
}

test("the send form reports how many of the audience LINE can actually reach", async ({ page }) => {
  await openLineOa(page);

  const send = page.locator("form").filter({ has: page.getByPlaceholder("輸入要發送的訊息") });
  await expect(send.getByText("發送對象")).toBeVisible();

  // The two numbers are reported separately: a push reaches only members who
  // have paired their account, and that gap is invisible everywhere else.
  await expect(send.getByText(/\d+ 位社員，其中 \d+ 位已加入 LINE 官方帳號/u)).toBeVisible();
});

test("an audience nobody has paired is refused rather than sent to nobody", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "line-oa-audience-1440", "Sending writes a push log entry.");
  await openLineOa(page);

  const send = page.locator("form").filter({ has: page.getByPlaceholder("輸入要發送的訊息") });
  await send.getByRole("radio", { name: "指定社員" }).click();
  await send.locator(".tag-option input").first().check();

  // None of the browser fixtures have paired an OA identity, so this audience
  // is addressable but unreachable -- the case worth being explicit about.
  await expect(send.getByText(/其中 0 位已加入/u)).toBeVisible();
  await expect(send.getByText(/位尚未加入官方帳號，這則訊息不會送達他們/u)).toBeVisible();

  await send.getByPlaceholder("輸入要發送的訊息").fill("瀏覽器測試訊息");
  await send.getByRole("button", { name: "送出訊息" }).click();

  await expect(page.getByText("指定的對象中沒有人加入官方帳號，訊息沒有送出。")).toBeVisible();
});
