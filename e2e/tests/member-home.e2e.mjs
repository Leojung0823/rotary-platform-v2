import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for member-home browser smoke tests.");
}

async function login(page, email) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

test("each upcoming event row opens that exact event in member mode", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await login(page, "e2e-shell-ordinary@example.test");
  const dashboard = page.url();
  const upcoming = page.locator("section").filter({
    has: page.getByRole("heading", { name: "近期活動", exact: true }),
  });
  const links = upcoming.getByRole("link").filter({ has: page.locator("strong") });
  await expect(links.first()).toBeVisible();
  const destinations = await links.evaluateAll((rows) => rows.map((row) => ({
    href: row.getAttribute("href"),
    title: row.querySelector("span:nth-child(2) > strong")?.textContent,
  })));
  expect(destinations.length).toBeGreaterThan(0);
  const clubs = new Set();
  for (const { href, title } of destinations) {
    expect(title).toBeTruthy();
    const destination = new URL(href, baseURL);
    expect(destination.pathname).toMatch(/^\/events\/[0-9a-f-]{36}$/u);
    expect(destination.searchParams.get("mode")).toBe("member");
    expect(destination.searchParams.get("clubId")).toMatch(/^[0-9a-f-]{36}$/u);
    clubs.add(destination.searchParams.get("clubId"));
    const link = upcoming.locator(`a[href="${href}"]`);
    await link.focus();
    await link.press("Enter");
    await expect(page).toHaveURL(destination.toString());
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByText("地點", { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.goto(dashboard);
  }
  expect(clubs.size).toBe(1);
  await expect(upcoming.getByRole("link", { name: /查看全部/u }))
    .toHaveAttribute("href", `/events?clubId=${[...clubs][0]}&mode=member`);
  await page.screenshot({ path: testInfo.outputPath("upcoming-event-links.png"), fullPage: true });
});

test("an event-response reminder opens and positions its exact event", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "member-home-1440", "one width is enough to verify the reminder destination");
  await login(page, "e2e-shell-ordinary@example.test");

  const eventId = "a1000000-0000-4000-8000-000000000102";
  const taskCard = page.locator("section").filter({
    has: page.getByRole("heading", { name: "待辦提醒", exact: true }),
  });
  const reminder = taskCard.getByRole("link").filter({ hasText: "本機下一場服務活動" });
  await expect(reminder).toHaveAttribute("href", new RegExp(`#event-${eventId}$`, "u"));
  await reminder.click();

  await expect(page).toHaveURL(new RegExp(`/events\\?clubId=[0-9a-f-]+&mode=member#event-${eventId}$`, "u"));
  const event = page.locator(`#event-${eventId}`);
  await expect(event.locator("details")).toHaveAttribute("open", "");
  await expect(event.getByRole("heading", { name: "本機下一場服務活動" })).toBeInViewport();
});

test("already-friend checks pairing in place and distinguishes lookup failures", async ({ page, context }, testInfo) => {
  await login(page, "e2e-shell-line-oa-unpaired@example.test");
  const taskCard = page.locator("section").filter({ has: page.getByRole("heading", { name: "待辦提醒", exact: true }) });
  await expect(taskCard.getByRole("link", { name: /查看全部/u })).toHaveAttribute("href", /\/tasks\?clubId=.*mode=member/u);
  await page.getByRole("link", { name: /加入本社 LINE OA/u }).click();
  await expect(page).toHaveURL(/\/me\/line-oa/u);
  let response = { status: 503, body: {} };
  await page.route("**/api/line-oa/onboarding/status?*", (route) => route.fulfill({
    status: response.status,
    contentType: "application/json",
    body: JSON.stringify(response.body),
  }));
  const button = page.getByRole("button", { name: "我已經是好友，確認連接" });
  await button.click();
  await expect(page.getByRole("alert").filter({ hasText: "暫時無法查詢連接狀態" })).toBeVisible();
  response = { status: 200, body: { connected: false, pairStatus: "unpaired" } };
  await button.click();
  await expect(page.getByRole("status")).toContainText("不代表您沒有加入好友");
  await expect(button).toBeEnabled();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("line-pairing-help.png"), fullPage: true });
  response = { status: 200, body: { connected: true, pairStatus: "paired" } };
  await button.click();
  await expect(page.getByRole("heading", { name: /已連接/u })).toBeVisible();
  await expect(button).toHaveCount(0);
  await expect(page).toHaveURL(/\/me\/line-oa/u);
  expect(context.pages()).toHaveLength(1);
});

test("member home is server-resolved, member-first, and responsive", async ({ page, browser }, testInfo) => {
  if (testInfo.project.name === "member-home-1440") {
    const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const memberPage = await memberContext.newPage();
    await login(memberPage, "e2e-shell-ordinary@example.test");
    await expect(memberPage.locator('img[src="/hero-mountains.webp"]')).toHaveCount(1);
    // The member shell owns one Next Image hint; duplicate hints were the
    // hosted-streaming regression this assertion is meant to catch.
    await expect(memberPage.locator('link[rel="preload"][as="image"][href="/hero-mountains.webp"]')).toHaveCount(1);
    // The old home card was replaced by the task list. This fixture has no
    // LINE Login identity, so binding is the first actionable task.
    const bindingTask = memberPage.getByRole("link", { name: "先綁定 LINE 身份" });
    await expect(bindingTask).toBeVisible();
    await expect(bindingTask).toHaveAttribute("href", /\/me\/line-oa\?clubId=.*mode=member/u);
    await expect(memberPage.getByRole("link", { name: "加入本社 LINE" })).toHaveCount(0);
    await expect(memberPage.getByRole("heading", { name: "今天與我有關的事情" })).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: "本機社員首頁例會" })).toBeVisible();
    await memberPage.getByRole("link", { name: "前往簽到" }).click();
    await expect(memberPage).toHaveURL(/\/events\/checkin/u);
    await memberContext.close();

    const lineOaContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const lineOaPage = await lineOaContext.newPage();
    await login(lineOaPage, "e2e-shell-line-oa-unpaired@example.test");
    await expect(lineOaPage.getByRole("heading", { name: "今天與我有關的事情" })).toBeVisible();
    // This account has a bound LINE Login identity but no follower row. The
    // homepage task must tell the member to add the OA instead of silently
    // treating the account as complete.
    const lineOaTask = lineOaPage.getByRole("link", { name: /加入本社 LINE OA/u });
    await expect(lineOaTask).toBeVisible();
    await expect(lineOaTask).toHaveAttribute("href", /\/me\/line-oa\?clubId=.*mode=member/u);
    await lineOaContext.close();

    const multiContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const multiPage = await multiContext.newPage();
    await login(multiPage, "e2e-shell-multi@example.test");
    await expect(multiPage.getByRole("heading", { name: "今天與我有關的事情" })).toBeVisible();
    await multiPage.getByLabel("切換目前所在的社或委員會").click();
    await multiPage.getByRole("button", { name: /^本機 Shell 第二社 E2E-SHELL-SECOND/u }).click();
    await expect(multiPage).toHaveURL(/\/dashboard\?mode=member$/u);
    await expect(multiPage.getByLabel("切換目前所在的社或委員會")).toContainText("本機 Shell 第二社");
    const heroRsvp = multiPage.getByRole("link", { name: "前往報名" });
    await expect(heroRsvp).toBeVisible();
    const expectedAnchor = "a1000000-0000-4000-8000-000000000108";
    const heroDestination = new URL(await heroRsvp.getAttribute("href"), baseURL);
    expect(heroDestination.pathname).toBe("/events");
    expect(heroDestination.searchParams.get("clubId")).toBe("a1000000-0000-4000-8000-000000000002");
    expect(heroDestination.searchParams.get("mode")).toBe("member");
    expect(heroDestination.hash).toBe(`#event-${expectedAnchor}`);
    await heroRsvp.click();
    const targetEvent = multiPage.locator(`#event-${expectedAnchor}`);
    await expect(targetEvent.locator("details")).toHaveAttribute("open", "");
    await expect(targetEvent.getByRole("heading", { name: "本機首頁按鈕定位驗收活動" })).toBeInViewport();
    await multiPage.goto("/dashboard?mode=member");
    // The shell and the member pages must use the same active-club choice.
    // Without this assertion, /club-affairs silently fell back to the first
    // club even though the shell still said the second club was active.
    await multiPage.getByRole("link", { name: "服務計劃", exact: true }).click();
    await expect(multiPage).toHaveURL(/\/club-affairs\?mode=member$/u);
    await expect(multiPage.getByRole("heading", { name: "本機 Shell 第二社" })).toBeVisible();
    await expect(multiPage.getByRole("heading", { name: "本機 Shell 社員社" })).toHaveCount(0);
    await multiContext.close();

    const managementContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const managementPage = await managementContext.newPage();
    await login(managementPage, "e2e-shell-management@example.test");
    await expect(managementPage.locator('img[src="/hero-mountains.webp"]')).toHaveCount(0);
    await expect(managementPage.getByRole("heading", { name: "平台管理工作台" })).toHaveCount(0);
    await expect(managementPage.locator("aside > header > p").first()).toHaveText("社務管理模式");
    await expect(managementPage.getByRole("heading", { name: "今天與我有關的事情" })).toHaveCount(0);
    await managementContext.close();

    const platformContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const platformPage = await platformContext.newPage();
    await login(platformPage, "e2e-shell-platform@example.test");
    await expect(platformPage.getByRole("heading", { name: "平台管理工作台" })).toBeVisible();
    await expect(platformPage.getByRole("heading", { name: "今天與我有關的事情" })).toHaveCount(0);
    await platformContext.close();
    return;
  }

  await login(page, "e2e-shell-ordinary@example.test");
  // The old home card was replaced by the task list. This fixture has no
  // LINE Login identity, so the first actionable task is binding LINE before
  // the member is asked to follow the club OA.
  const lineOaTask = page.getByRole("link", { name: "先綁定 LINE 身份" });
  await expect(lineOaTask).toBeVisible();
  await expect(lineOaTask).toHaveAttribute("href", /\/me\/line-oa\?clubId=.*mode=member/u);
  await expect(page.getByRole("heading", { name: "今天與我有關的事情" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主要導覽" })).toHaveCount(1);
  if (testInfo.project.name === "member-home-320") await expectNoHorizontalOverflow(page);
  if (testInfo.project.name === "member-home-768") {
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await expect(page.getByRole("link", { name: "前往簽到" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  if (["member-home-412", "member-home-375", "member-home-320"].includes(testInfo.project.name)) {
    await expect(page.getByRole("link", { name: "前往簽到" })).toBeVisible();
  }
});

test("the bell opens its notices in place instead of leaving the page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "member-home-1440", "one width is enough for a behaviour");
  await login(page, "e2e-shell-ordinary@example.test");
  await expect(page.getByRole("heading", { name: "今天與我有關的事情" })).toBeVisible();

  const bell = page.getByRole("button", { name: "社內訊息" });
  const panel = page.getByRole("dialog", { name: "社內訊息" });
  await expect(bell).toBeVisible();
  await expect(bell).toHaveAttribute("aria-expanded", "false");
  await expect(panel).toBeHidden();

  const before = page.url();
  await bell.click();
  await expect(panel).toBeVisible();
  await expect(bell).toHaveAttribute("aria-expanded", "true");
  // The whole point: the member is still on the home page.
  expect(page.url()).toBe(before);
  await expect(panel.getByRole("link", { name: "開啟訊息中心 →" })).toBeVisible();

  // Escape closes it and puts the caret back where it was.
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(bell).toBeFocused();

  // And a click anywhere else closes it too.
  await bell.click();
  await expect(panel).toBeVisible();
  await page.getByRole("heading", { name: "今天與我有關的事情" }).click();
  await expect(panel).toBeHidden();
});

test("每張卡片的查看全部連到自己的清單", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "member-home-1440", "one width is enough for a link");
  await login(page, "e2e-shell-ordinary@example.test");

  // 社團訊息's 查看全部 used to be hardcoded to /events along with every other
  // card's, so it sent a member to the events page.
  const notices = page.locator("section").filter({ hasText: "社團訊息" }).first();
  await expect(notices.getByRole("heading", { name: "社團訊息" })).toBeVisible();
  await expect(notices.getByRole("link", { name: /查看全部/u })).toHaveAttribute("href", /\/messages\?/u);

  const tasks = page.locator("section").filter({ has: page.getByRole("heading", { name: "待辦提醒", exact: true }) });
  const taskListLink = tasks.getByRole("link", { name: /查看全部/u });
  await expect(taskListLink).toHaveAttribute("href", /\/tasks\?clubId=.*mode=member/u);
  await taskListLink.click();
  await expect(page).toHaveURL(/\/tasks\?clubId=.*mode=member/u);
  await expect(page.getByRole("heading", { name: "我的待辦", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回社員首頁" })).toBeVisible();
});

test("社員待辦頁在窄手機畫面可讀且沒有橫向溢位", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "member-home-320", "one narrow mobile width is enough for the task page");
  await login(page, "e2e-shell-ordinary@example.test");

  const tasks = page.locator("section").filter({ has: page.getByRole("heading", { name: "待辦提醒", exact: true }) });
  await tasks.getByRole("link", { name: /查看全部/u }).click();
  await expect(page).toHaveURL(/\/tasks\?clubId=.*mode=member/u);
  await expect(page.getByRole("heading", { name: "我的待辦", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
