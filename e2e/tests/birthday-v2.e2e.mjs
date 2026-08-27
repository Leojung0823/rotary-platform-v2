import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const clubId = "a1000000-0000-4000-8000-000000000004";
const authorEmail = "e2e-shell-multi@example.test";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for birthday V2 browser tests.");
}

async function login(page) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(authorEmail);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function openBirthdayPage(page) {
  await page.goto(new URL(`/birthdays?clubId=${clubId}`, baseURL).toString());
  await expect(page.getByRole("heading", { name: "生日祝福", exact: true })).toBeVisible();
  await expect(page.getByText(/同一位壽星可收到多則祝福/u)).toBeVisible();
}

async function submitBirthdayAction(page, button) {
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST" && new URL(response.url()).pathname === "/birthdays";
  }, { timeout: 20_000 });
  await button.click();
  await responsePromise;
}

function birthdayWall(page) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: "生日祝福牆", exact: true }),
  }).first();
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("生日祝福 V2 核心瀏覽器回歸", () => {
  test("同一作者同一天可送多則，生日年齡顯示且作者保持匿名", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "birthday-v2-1440", "This flow mutates shared local birthday fixtures.");
    test.setTimeout(45_000);

    await login(page);
    await openBirthdayPage(page);

    const recipientCard = page.locator("section.card").filter({
      has: page.getByRole("heading", { name: /^生日 V2 測試壽星 \d+$/u }),
    }).last();
    await expect(recipientCard).toBeVisible();
    await expect(recipientCard.getByText(/目前 \d+ 歲/u)).toBeVisible();

    const firstContent = `生日 V2 瀏覽器回歸一 ${Date.now()}`;
    const secondContent = `生日 V2 瀏覽器回歸二 ${Date.now()}`;
    await recipientCard.locator('textarea[name="content"]').fill(firstContent);
    await submitBirthdayAction(page, recipientCard.getByRole("button", { name: "送出祝福" }));
    await page.reload();

    const refreshedRecipientCard = page.locator("section.card").filter({
      has: page.getByRole("heading", { name: /^生日 V2 測試壽星 \d+$/u }),
    }).last();
    await expect(refreshedRecipientCard).toBeVisible();
    await refreshedRecipientCard.locator('textarea[name="content"]').fill(secondContent);
    await submitBirthdayAction(page, refreshedRecipientCard.getByRole("button", { name: "送出祝福" }));
    await page.reload();

    const wall = birthdayWall(page);
    const firstWish = wall.locator("section.card").filter({ hasText: firstContent }).first();
    const secondWish = wall.locator("section.card").filter({ hasText: secondContent }).first();
    await expect(firstWish).toBeVisible();
    await expect(secondWish).toBeVisible();
    await expect(firstWish.getByText("匿名祝福者", { exact: true })).toBeVisible();
    await expect(secondWish.getByText("匿名祝福者", { exact: true })).toBeVisible();
    await expect(firstWish.getByText("多社社員", { exact: true })).toHaveCount(0);
    await expect(secondWish.getByText("多社社員", { exact: true })).toHaveCount(0);
  });

  test("412px 核心生日頁沒有水平溢位", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "birthday-v2-412", "This assertion targets the mobile birthday V2 project.");

    await login(page);
    await openBirthdayPage(page);
    await expect(page.getByRole("heading", { name: "生日祝福牆", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
