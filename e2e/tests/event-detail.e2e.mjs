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

test("event reply choices stay side by side and only the selected choice is blue", async ({ page }) => {
  await login(page);
  const id = "a1000000-0000-4000-8000-000000000102";
  await page.goto(`/events/${id}?mode=member`);
  const choices = page.locator("form [data-response-choice]");
  await expect(choices).toHaveCount(2);
  await expect(choices.first()).toBeVisible();
  await expect(page.locator('[data-response-choice="declined"]')).toHaveText("不克參加");
  await expect(page.locator('[data-response-choice="attending"]')).toHaveText("我要參加");

  const boxes = await Promise.all([0, 1].map(index => choices.nth(index).boundingBox()));
  expect(boxes[0]).not.toBeNull();
  expect(boxes[1]).not.toBeNull();
  expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(1);
  expect(boxes[0].x).toBeLessThan(boxes[1].x);
  for (const button of await choices.all()) {
    const selected = await button.getAttribute("aria-pressed") === "true";
    const classes = (await button.getAttribute("class")).split(/\s+/u);
    expect(classes.includes("button-secondary")).toBe(!selected);
  }
});

test("one click saves attendance and optional fields without a second submit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "event-detail-1440", "Write the shared fixture only once.");
  test.setTimeout(90_000);
  await login(page);
  const id = "a1000000-0000-4000-8000-000000000102";
  await page.goto(`/events?mode=member&clubId=a1000000-0000-4000-8000-000000000001#event-${id}`);
  const card = page.locator(`#event-${id}`);
  const choose = async (response, target = card, pathname = "/events") => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const hold = async (route) => {
      if (route.request().method() === "POST") await gate;
      await route.continue();
    };
    const routePattern = `**${pathname}*`;
    await page.route(routePattern, hold);
    const committed = page.waitForResponse((result) => result.request().method() === "POST"
      && new URL(result.url()).pathname === pathname);
    await target.locator(`[data-response-choice="${response}"]`).click();
    try {
      for (const button of await target.locator("[data-response-choice]").all()) await expect(button).toBeDisabled();
    } finally {
      release();
    }
    const result = await committed;
    await page.unroute(routePattern, hold);
    expect(result.ok()).toBe(true);
    await expect(target.getByRole("status")).toContainText("報名狀態已更新");
    await page.reload();
    if (pathname === "/events") {
      await expect(card.locator("details")).toHaveAttribute("open", "");
    } else {
      await expect(page.locator(`[data-response-choice="${response}"]`)).toBeVisible();
    }
  };
  await card.getByLabel("攜伴人數（選填）").fill("1");
  await card.getByLabel("備註（選填）").fill("本機一鍵報名測試");
  await choose("attending");
  await expect(card.locator('[data-response-choice="attending"]')).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByLabel("攜伴人數（選填）")).toHaveValue("1");
  await expect(card.getByLabel("備註（選填）")).toHaveValue("本機一鍵報名測試");
  await card.screenshot({ path: testInfo.outputPath("one-click-registration.png") });

  // Clicking the selected answer with untouched fields cancels the reply.
  await choose("attending");
  await expect(card.locator('[data-response-choice="attending"]')).toHaveAttribute("aria-pressed", "false");
  await expect(card.locator('[data-response-choice="declined"]')).toHaveAttribute("aria-pressed", "false");
  await expect(card).toContainText("我的狀態：尚未回覆");

  // A changed note or guest count means the same button saves the edit instead
  // of accidentally treating the click as a cancellation.
  await card.getByLabel("攜伴人數（選填）").fill("1");
  await choose("attending");
  await choose("declined");
  await expect(card.locator('[data-response-choice="declined"]')).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByLabel("攜伴人數（選填）")).toHaveValue("0");
  await choose("declined");
  await expect(card.locator('[data-response-choice="declined"]')).toHaveAttribute("aria-pressed", "false");
  await expect(card).toContainText("我的狀態：尚未回覆");

  await page.goto(`/events/${id}?mode=member`);
  const detailForm = page.locator("form");
  await choose("attending", detailForm, `/events/${id}`);
  await expect(detailForm.locator('[data-response-choice="attending"]')).toHaveAttribute("aria-pressed", "true");
  await choose("attending", detailForm, `/events/${id}`);
  await expect(detailForm.locator('[data-response-choice="attending"]')).toHaveAttribute("aria-pressed", "false");
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
