import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// A member of the club who also manages it, and a plain member of the same club.
const officerEmail = "e2e-shell-member-manager@example.test";
const memberEmail = "e2e-shell-ordinary@example.test";
const messageTitle = `瀏覽器測試訊息 ${Date.now()}`;

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for message centre browser tests.");
}

async function login(page, email) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

test("a plain member has an inbox but no way to write to the club", async ({ page }) => {
  await login(page, memberEmail);
  const navigation = page.getByRole("navigation", { name: "主要導覽" });
  await expect(navigation.locator('[data-navigation-id="messages"]')).toHaveCount(0);
  await page.getByRole("link", { name: /訊息中心/u }).first().click();
  await expect(page).toHaveURL(/\/messages/u);
  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.innerWidth);

  await expect(page.getByRole("heading", { name: "我的訊息" })).toBeVisible();
  // Sending is a management act; a member is offered no composer at all rather
  // than a control that fails when used.
  await expect(page.getByRole("heading", { name: "公告管理" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "公告排程與紀錄" })).toHaveCount(0);
});

test("an officer sends a message and the member it was addressed to reads it", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Sending a message mutates shared fixture data.");
  // Two sign-ins and a delivery round trip; the 30s default is not enough.
  test.setTimeout(90_000);

  await login(page, officerEmail);
  await page.goto(new URL("/messages", baseURL).toString());
  await expect(page.getByRole("heading", { name: "公告管理" })).toBeVisible();

  await page.getByLabel("標題").fill(messageTitle);
  await page.getByLabel("內容").fill("這是一則瀏覽器測試訊息，內容只用於驗收。");
  await page.getByRole("button", { name: "立即發布並嘗試 LINE 推播" }).click();
  await expect(page.getByText("訊息已送出。", { exact: false })).toBeVisible();

  // The member reads it in their own session, which is the only place the
  // delivery can actually be observed.
  const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const memberPage = await memberContext.newPage();
    await login(memberPage, memberEmail);
    await memberPage.goto(new URL("/messages", baseURL).toString());

    const entry = memberPage.getByRole("button", { name: new RegExp(messageTitle, "u") });
    await expect(entry).toBeVisible();
    await expect(entry).toHaveAttribute("aria-expanded", "false");
    await expect(memberPage.getByLabel("未讀").first()).toBeVisible();

    await entry.click();
    await expect(entry).toHaveAttribute("aria-expanded", "true");
    await expect(memberPage.getByText("這是一則瀏覽器測試訊息，內容只用於驗收。")).toBeVisible();

    // Reading is recorded server-side, so it survives a reload rather than
    // living in component state.
    await memberPage.reload();
    await expect(memberPage.getByRole("button", { name: new RegExp(messageTitle, "u") })).toBeVisible();
    await expect(memberPage.getByText(new RegExp(`^${messageTitle}$`, "u")).locator("xpath=..").getByLabel("未讀"))
      .toHaveCount(0);

    await page.reload();
    const lifecycle = page.locator("article").filter({ hasText: messageTitle }).first();
    await expect(lifecycle).toBeVisible();
    await lifecycle.getByRole("button", { name: "置頂公告" }).click();
    await expect(lifecycle.getByRole("button", { name: "取消置頂" })).toBeVisible();

    await memberPage.reload();
    const pinnedEntry = memberPage.getByRole("button", { name: new RegExp(messageTitle, "u") });
    await expect(memberPage.getByRole("heading", { name: "置頂公告" })).toBeVisible();
    await expect(pinnedEntry).toBeVisible();
    await expect(pinnedEntry).toHaveCount(1);
  } finally {
    await memberContext.close();
  }

  // The officer's own view reports the delivery, including who has not read it.
  await page.reload();
  const sent = page.locator("article").filter({ hasText: messageTitle }).first();
  await expect(sent).toBeVisible();
  await expect(sent.getByText(/已讀 \d+／\d+/u)).toBeVisible();
  await sent.getByRole("button", { name: "查看誰還沒讀" }).click();
  await expect(sent.getByText(/尚未讀取（\d+ 位）：|所有收件的社員都已讀。/u)).toBeVisible();
});

test("an officer can save a draft, edit it, schedule it and cancel the schedule", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Lifecycle actions mutate shared fixture data.");
  test.setTimeout(60_000);
  await login(page, officerEmail);
  await page.goto(new URL("/messages", baseURL).toString());

  const draftTitle = `公告草稿測試 ${Date.now()}`;
  await page.getByLabel("標題").fill(draftTitle);
  await page.getByLabel("內容").fill("建立草稿後可以修改，再設定預定發布時間。");
  await page.getByRole("button", { name: "儲存草稿" }).click();
  await expect(page.getByText("草稿已儲存。", { exact: true })).toBeVisible();

  const draft = page.locator("article").filter({ hasText: draftTitle }).first();
  await expect(draft).toBeVisible();
  await expect(draft.getByText("草稿", { exact: true })).toBeVisible();
  await draft.getByRole("button", { name: "編輯草稿" }).click();

  const updatedTitle = `${draftTitle}（已更新）`;
  await page.getByLabel("標題").fill(updatedTitle);
  const futureLocal = new Date(Date.now() + 10 * 60_000);
  const scheduledValue = new Date(futureLocal.getTime() - futureLocal.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);
  await page.getByLabel("預定發布時間（排程時必填）").fill(scheduledValue);
  await page.getByRole("button", { name: "排程發布" }).click();
  await expect(page.getByText(/已排定發布/u)).toBeVisible();

  const scheduled = page.locator("article").filter({ hasText: updatedTitle }).first();
  await expect(scheduled.getByText("已排程")).toBeVisible();
  await scheduled.getByRole("button", { name: "取消排程" }).click();
  await expect(scheduled.getByText("已取消")).toBeVisible();
  await expect(page.getByText(/這則公告只會出現在 App/u)).toBeVisible();
});
