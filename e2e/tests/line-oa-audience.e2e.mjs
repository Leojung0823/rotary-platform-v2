import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const officerEmail = "e2e-shell-member-manager@example.test";
const managementEmail = "e2e-shell-management@example.test";
const managedClubId = "a1000000-0000-4000-8000-000000000003";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for LINE OA audience browser tests.");
}

async function loginAs(page, email) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function openLineOa(page) {
  await loginAs(page, officerEmail);

  await page.goto(new URL("/dashboard?mode=member", baseURL).toString());
  await page.getByLabel("帳號選單").click();
  await page.getByRole("link", { name: "進入社務管理" }).click();
  await expect(page).toHaveURL(/\/members/u);
  await page.getByRole("link", { name: "LINE OA" }).click();
  await expect(page.getByRole("heading", { name: "LINE Official Account" })).toBeVisible();
}

async function openManagedLineOa(page) {
  await loginAs(page, managementEmail);
  await page.goto(new URL(`/clubs/${managedClubId}/line-oa?mode=management`, baseURL).toString());
  await expect(page.getByRole("heading", { name: "LINE Official Account" })).toBeVisible();
}

test("OA verification is available and fails closed in local mock mode", async ({ page }) => {
  await openLineOa(page);
  await page.getByRole("button", { name: "驗證 LINE OA", exact: true }).click();
  await expect(page.getByText("目前環境未開啟 LINE 真實模式，不能完成 OA 驗證。")).toBeVisible();
  await expect(page).toHaveURL(/error=oa_live_mode_required/u);
});

test("the send form reports how many of the audience LINE can actually reach", async ({ page }) => {
  await openLineOa(page);

  const send = page.locator("form").filter({ has: page.getByPlaceholder("輸入要發送的訊息") });
  await expect(send.getByText("發送對象")).toBeVisible();

  // The two numbers are reported separately: a push reaches only members who
  // have paired their account, and that gap is invisible everywhere else.
  await expect(send.getByText(/\d+ 位社員，其中 \d+ 位已完成 LINE OA 配對、可收到推播/u)).toBeVisible();
});

test("an enabled Flex template shows a safe card preview", async ({ page }) => {
  await openLineOa(page);

  const send = page.locator("form").filter({ has: page.getByPlaceholder("輸入要發送的訊息") });
  await expect(send.getByLabel("訊息樣式")).toBeVisible();
  await send.getByLabel("訊息樣式").selectOption("event");
  await send.getByPlaceholder("例如：九月份例會提醒").fill("本週例會");
  await send.getByPlaceholder("輸入要發送的訊息").fill("星期五晚上見！");

  const preview = send.getByRole("region", { name: "訊息卡片預覽" });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("活動提醒");
  await expect(preview).toContainText("本週例會");
  await expect(preview).toContainText("星期五晚上見！");
});

test("an audience nobody has paired is refused rather than sent to nobody", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "line-oa-audience-1440", "Sending writes a push log entry.");
  await openLineOa(page);

  const send = page.locator("form").filter({ has: page.getByPlaceholder("輸入要發送的訊息") });
  await send.getByRole("radio", { name: "指定社員" }).click();
  await send.locator(".tag-option input").first().check();

  // None of the browser fixtures have paired an OA identity, so this audience
  // is addressable but unreachable -- the case worth being explicit about.
  await expect(send.getByText(/其中 0 位已完成 LINE OA 配對/u)).toBeVisible();
  await expect(send.getByText(/位尚未與本社 LINE OA 完成配對，這則訊息不會送達他們/u)).toBeVisible();

  await send.getByPlaceholder("輸入要發送的訊息").fill("瀏覽器測試訊息");
  await send.getByRole("button", { name: "送出訊息" }).click();

  await expect(page.getByText("指定的對象中沒有人加入官方帳號，訊息沒有送出。")).toBeVisible();
});

test("a manager sees a quota stop notice while a member cannot read it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "line-oa-audience-1440", "This is a desktop management notice assertion.");
  await openManagedLineOa(page);

  await expect(page.getByText("LINE 推播已暫停：", { exact: true })).toBeVisible();
  await expect(page.getByText("已達 LINE 的推播頻率或方案額度上限，系統已停止後續批次。", { exact: false })).toBeVisible();
  await expect(page.getByText(/最近一次推播嘗試 700 位，已送達 500 位（1\/2 批）/u)).toBeVisible();

  const memberContext = await page.context().browser().newContext({ baseURL });
  const memberPage = await memberContext.newPage();
  try {
    await loginAs(memberPage, "e2e-shell-ordinary@example.test");
    await memberPage.goto(new URL(`/clubs/${managedClubId}/line-oa?mode=management`, baseURL).toString());
    await expect(memberPage).toHaveURL(/\/access-denied(?:\?|$)/u);
    await expect(memberPage.getByText("LINE 推播已暫停：", { exact: true })).toHaveCount(0);
  } finally {
    await memberContext.close();
  }
});
