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

test("member home is server-resolved, member-first, and responsive", async ({ page, browser }, testInfo) => {
  if (testInfo.project.name === "member-home-1440") {
    const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const memberPage = await memberContext.newPage();
    await login(memberPage, "e2e-shell-ordinary@example.test");
    await expect(memberPage.locator('img[src="/hero-mountains.webp"]')).toHaveCount(1);
    // The member shell owns one Next Image hint; duplicate hints were the
    // hosted-streaming regression this assertion is meant to catch.
    await expect(memberPage.locator('link[rel="preload"][as="image"][href="/hero-mountains.webp"]')).toHaveCount(1);
    await expect(memberPage.getByRole("heading", { name: "加入「本機 Shell 社員社」LINE 官方帳號" })).toBeVisible();
    await expect(memberPage.getByRole("link", { name: "綁定 LINE 身份" })).toHaveAttribute(
      "href",
      "/api/auth/line/start?flow=bind&returnTo=%2Fme%2Fline-oa",
    );
    await expect(memberPage.getByRole("link", { name: "加入本社 LINE" })).toHaveCount(0);
    await expect(memberPage.getByRole("heading", { name: "今天與我有關的事情" })).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: "本機社員首頁例會" })).toBeVisible();
    await memberPage.getByRole("link", { name: "前往簽到" }).click();
    await expect(memberPage).toHaveURL(/\/events\/checkin/u);
    await memberContext.close();

    const multiContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const multiPage = await multiContext.newPage();
    await login(multiPage, "e2e-shell-multi@example.test");
    await expect(multiPage.getByRole("heading", { name: "今天與我有關的事情" })).toBeVisible();
    await multiPage.getByLabel("切換目前所在的社或委員會").click();
    await multiPage.getByRole("button", { name: /^本機 Shell 第二社 E2E-SHELL-SECOND/u }).click();
    await expect(multiPage.getByLabel("切換目前所在的社或委員會")).toContainText("本機 Shell 第二社");
    // The shell and the member pages must use the same active-club choice.
    // Without this assertion, /club-affairs silently fell back to the first
    // club even though the shell still said the second club was active.
    await multiPage.getByRole("link", { name: "社務" }).click();
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
  await expect(page.getByRole("heading", { name: "加入「本機 Shell 社員社」LINE 官方帳號" })).toBeVisible();
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
});
