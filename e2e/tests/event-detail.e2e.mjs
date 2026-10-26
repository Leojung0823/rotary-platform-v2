import { expect, test } from "@playwright/test";
import { openEventDetails } from "./member-event-list.mjs";

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

  const title = (await page.locator("details.event-fold > summary h2").first().innerText()).trim();
  await openEventDetails(page);
  const intoDetail = page.getByRole("link", { name: "查看活動詳情" }).first();
  await expect(intoDetail).toBeVisible();
  await intoDetail.click();

  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}/u);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // The facts a member came for, each labelled rather than run together.
  await expect(page.getByText("日期", { exact: true })).toBeVisible();
  await expect(page.getByText("時間", { exact: true })).toBeVisible();
  await expect(page.getByText("地點", { exact: true })).toBeVisible();
  await expect(page.getByText("目前參加", { exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "← 回到活動列表" })).toBeVisible();
});

test("an event anchor expands the exact card after streaming and reload", async ({ page }) => {
  await login(page);
  const id = "a1000000-0000-4000-8000-000000000102";
  await page.goto(`/events?mode=member&clubId=a1000000-0000-4000-8000-000000000001#event-${id}`);
  const card = page.locator(`#event-${id}`);
  await expect(card.locator("details")).toHaveAttribute("open", "");
  await expect(card.getByRole("heading", { name: "本機下一場服務活動" })).toBeInViewport();
  await expect(card.locator("select[name=response]")).toHaveCount(0);
  await page.reload();
  await expect(card.locator("details")).toHaveAttribute("open", "");
  await expect(card.getByRole("heading", { name: "本機下一場服務活動" })).toBeInViewport();
});

test("one click saves attendance and optional fields without a second submit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "event-detail-1440", "Write the shared fixture only once.");
  test.setTimeout(90_000);
  await login(page);
  const id = "a1000000-0000-4000-8000-000000000102";
  await page.goto(`/events?mode=member&clubId=a1000000-0000-4000-8000-000000000001#event-${id}`);
  const card = page.locator(`#event-${id}`);
  const choose = async (response) => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const hold = async (route) => {
      if (route.request().method() === "POST") await gate;
      await route.continue();
    };
    await page.route("**/events?*", hold);
    const committed = page.waitForResponse((result) => result.request().method() === "POST"
      && new URL(result.url()).pathname === "/events");
    await card.locator(`button[name=response][value=${response}]`).click();
    try {
      for (const button of await card.locator("button[name=response]").all()) await expect(button).toBeDisabled();
    } finally {
      release();
    }
    const result = await committed;
    await page.unroute("**/events?*", hold);
    expect(result.ok()).toBe(true);
    await expect(card.getByRole("status")).toContainText("報名狀態已更新");
    await page.reload();
    await expect(card.locator("details")).toHaveAttribute("open", "");
  };
  await card.getByLabel("攜伴人數（選填）").fill("1");
  await card.getByLabel("備註（選填）").fill("本機一鍵報名測試");
  await choose("attending");
  await expect(card.locator('button[value="attending"]')).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByLabel("攜伴人數（選填）")).toHaveValue("1");
  await expect(card.getByLabel("備註（選填）")).toHaveValue("本機一鍵報名測試");
  await card.screenshot({ path: testInfo.outputPath("one-click-registration.png") });
  await choose("declined");
  await expect(card.locator('button[value="declined"]')).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByLabel("攜伴人數（選填）")).toHaveValue("0");
  await choose("pending");
  await expect(card).toContainText("我的狀態：待確認");
  await page.goto(`/events/${id}?mode=member`);
  await page.getByLabel("備註（選填）").fill("");
  const detailAttending = page.waitForResponse((result) => result.request().method() === "POST"
    && new URL(result.url()).pathname === `/events/${id}`);
  await page.locator('button[name=response][value=attending]').click();
  expect((await detailAttending).ok()).toBe(true);
  await expect(page.locator("form").getByRole("status")).toContainText("報名狀態已更新");
  await page.reload();
  await expect(page.locator('button[value=attending]')).toHaveAttribute("aria-pressed", "true");
  const detailPending = page.waitForResponse((result) => result.request().method() === "POST"
    && new URL(result.url()).pathname === `/events/${id}`);
  await page.locator('button[name=response][value=pending]').click();
  expect((await detailPending).ok()).toBe(true);
  await expect(page.locator("form").getByRole("status")).toContainText("報名狀態已更新");
  await page.reload();
  await expect(page.locator('button[value=attending]')).toHaveAttribute("aria-pressed", "false");
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
  await expect(page.locator('button[name="response"]')).toHaveCount(0);
});

test("the check-in prompt is absent for an event that is not running", async ({ page }) => {
  await login(page);
  await page.goto(new URL("/events?mode=member", baseURL).toString());
  await openEventDetails(page);
  await page.getByRole("link", { name: "查看活動詳情" }).first().click();
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
