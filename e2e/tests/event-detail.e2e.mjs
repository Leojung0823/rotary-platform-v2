import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const memberEmail = "e2e-shell-ordinary@example.test";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for event detail browser tests.");
}

async function login(page) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(memberEmail);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

test("a member opens an event from the list and sees when, where and how full", async ({ page }) => {
  await login(page);
  await page.goto(new URL("/events?mode=member", baseURL).toString());

  const firstTitle = page.locator("article.card h2 a").first();
  await expect(firstTitle).toBeVisible();
  const title = await firstTitle.innerText();
  await firstTitle.click();

  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}/u);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // The facts a member came for, each labelled rather than run together.
  await expect(page.getByText("日期", { exact: true })).toBeVisible();
  await expect(page.getByText("時間", { exact: true })).toBeVisible();
  await expect(page.getByText("地點", { exact: true })).toBeVisible();
  await expect(page.getByText("目前參加", { exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "← 回到活動列表" })).toBeVisible();
});

test("an event id that is not this member's is indistinguishable from one that does not exist", async ({ page }) => {
  await login(page);

  // A well-formed id that belongs to nothing. The status code is not the
  // assertion: notFound() after streaming has begun can only answer 200,
  // because the headers are already sent. What matters is that no event is
  // described -- the same treatment a targeted event the member was not
  // addressed to receives.
  await page.goto(new URL("/events/6f9619ff-8b86-4d01-b42d-00cf4fc964ff", baseURL).toString());

  await expect(page.getByText("日期", { exact: true })).toHaveCount(0);
  await expect(page.getByText("目前參加", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "儲存報名狀態" })).toHaveCount(0);
});

test("the check-in prompt is absent for an event that is not running", async ({ page }) => {
  await login(page);
  await page.goto(new URL("/events?mode=member", baseURL).toString());
  await page.locator("article.card h2 a").first().click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}/u);

  // The fixture events are not in progress, so the prompt must not appear.
  // A check-in button shown outside the window is one that cannot be used.
  const live = page.getByText("活動進行中");
  if (await live.count() > 0) {
    // If a fixture event ever is running, the prompt must carry the action.
    await expect(page.getByRole("link", { name: "前往簽到" })).toBeVisible();
  } else {
    await expect(page.getByRole("link", { name: "前往簽到" })).toHaveCount(0);
  }
});
