import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const managerEmail = "e2e-shell-member-manager@example.test";
const memberEmail = "e2e-shell-ordinary@example.test";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for attendance browser tests.");
}

async function login(page, email) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

test("a member sees their own attendance rate and the events behind it", async ({ page }) => {
  await login(page, memberEmail);
  await page.goto(new URL("/attendance?mode=member", baseURL).toString());

  await expect(page.getByRole("heading", { name: "我的出席" })).toBeVisible();
  // The rate is rendered from the database's own denominator, so assert the
  // shape rather than a number the fixtures could legitimately change.
  await expect(page.getByText("出席率", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".metric-value").first()).toHaveText(/^\d+\.\d%$/u);

  // A plain member must not be offered the management view.
  await expect(page.getByRole("link", { name: "出席管理" })).toHaveCount(0);
});

test("the default range is the current Rotary year and a custom range is honoured", async ({ page }) => {
  await login(page, memberEmail);
  await page.goto(new URL("/attendance?mode=member", baseURL).toString());

  const from = page.locator('input[name="dateFrom"]');
  await expect(from).toHaveValue(/-07-01$/u);

  // A range the database would reject must not blank the page.
  await page.goto(new URL("/attendance?dateFrom=2020-01-01&dateTo=2026-12-31", baseURL).toString());
  await expect(page.getByText("查詢期間不正確")).toBeVisible();
  await expect(page.getByRole("heading", { name: "我的出席" })).toBeVisible();
});

test("a manager adjusts attendance and can take it back", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "attendance-1440", "Adjusting attendance mutates shared fixture data.");
  await login(page, managerEmail);
  await page.goto(new URL("/attendance/manage?mode=management", baseURL).toString());

  await expect(page.getByRole("heading", { name: "出席管理與統計" })).toBeVisible();
  await expect(page.getByText("平均出席率")).toBeVisible();

  // Open the first event's roster.
  const openRoster = page.getByRole("link", { name: "查看名冊 →" }).first();
  await expect(openRoster).toBeVisible();
  await openRoster.click();
  await expect(page.getByRole("link", { name: "匯出 CSV" })).toBeVisible();

  // Work on a member who currently has no adjustment, so the test does not
  // depend on what an earlier run left behind.
  const card = page.locator("article.card").filter({
    has: page.getByRole("button", { name: "登記調整" }),
  }).first();
  await expect(card).toBeVisible();
  const memberName = await card.locator("h3").innerText();

  // Located by control name: these inputs sit inside a wrapping <label>, whose
  // accessible name absorbs the <option> text, so getByLabel is unreliable here.
  await card.locator('select[name="adjustmentType"]').selectOption("official_leave");
  await card.locator('input[name="reason"]').fill("地區年會出席，瀏覽器測試");
  await card.getByRole("button", { name: "登記調整" }).click();

  await expect(page.getByText("出席調整已記錄")).toBeVisible();
  const adjusted = page.locator("article.card").filter({ hasText: memberName }).first();
  await expect(adjusted.getByText("已調整：公假")).toBeVisible();

  // And the adjustment can be revoked, restoring the raw check-in result.
  await adjusted.locator('input[name="revocationReason"]').fill("瀏覽器測試結束，還原");
  await adjusted.getByRole("button", { name: "撤銷調整" }).click();
  await expect(page.getByText("出席調整已撤銷")).toBeVisible();
  await expect(
    page.locator("article.card").filter({ hasText: memberName }).first().getByText("已調整：公假"),
  ).toHaveCount(0);
});

test("the CSV export is served as a download, not rendered", async ({ page }) => {
  await login(page, managerEmail);
  await page.goto(new URL("/attendance/manage?mode=management", baseURL).toString());
  await page.getByRole("link", { name: "查看名冊 →" }).first().click();

  const link = page.getByRole("link", { name: "匯出 CSV" });
  await expect(link).toBeVisible();
  const href = await link.getAttribute("href");
  const response = await page.request.get(new URL(href, baseURL).toString());
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  expect(response.headers()["content-disposition"]).toContain("attachment");

  const body = await response.text();
  // The BOM is what makes Chinese names readable in Excel.
  expect(body.codePointAt(0)).toBe(0xfeff);
  expect(body).toContain('"社員姓名"');
});

test("a plain member cannot reach the management page by typing the URL", async ({ page }) => {
  await login(page, memberEmail);
  await page.goto(new URL("/attendance/manage", baseURL).toString());

  // The page itself renders, but the database offers no club to manage.
  await expect(page.getByText("目前沒有可管理出席的扶輪社")).toBeVisible();
  await expect(page.getByRole("button", { name: "登記調整" })).toHaveCount(0);
});
