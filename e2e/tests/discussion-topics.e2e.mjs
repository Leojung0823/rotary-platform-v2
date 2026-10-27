import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const clubId = "a1000000-0000-4000-8000-000000000001";

async function signIn(page, email) {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for discussion topic browser tests.");
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

function futureTaipeiDateTime() {
  const at = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + "-" + values.month + "-" + values.day + "T" + values.hour + ":" + values.minute;
}

test("幹部發佈議題後，社員收到待辦、留言投票，具名票只在管理模式可見", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "This flow writes fixture data and runs once.");
  test.setTimeout(60_000);
  const title = "議題討論驗收 " + Date.now();
  const comment = "我支持先小規模試辦，再依成果調整。";

  await signIn(page, "e2e-shell-member-manager@example.test");
  await page.goto(new URL("/clubs/" + clubId + "/topics?mode=management", baseURL).toString());
  await expect(page.getByRole("heading", { name: "議題討論管理" })).toBeVisible();
  await page.locator('input[name="title"]').fill(title);
  await page.locator('textarea[name="description"]').fill("請社員分享想法，並投票決定是否先進行小規模試辦。");
  await page.locator('textarea[name="options"]').fill("先小規模試辦\n維持原計劃");
  await page.locator('input[name="deadlineAt"]').fill(futureTaipeiDateTime());
  await page.getByRole("radio", { name: /具名投票/u }).check();
  await page.getByRole("button", { name: "發布議題" }).click();
  await expect(page.getByRole("status").filter({ hasText: "議題已發佈" })).toContainText("議題已發佈");

  const managerTopic = page.getByRole("link").filter({ hasText: title }).first();
  await expect(managerTopic).toBeVisible();
  await managerTopic.click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const memberPage = await memberContext.newPage();
    await signIn(memberPage, "e2e-shell-ordinary@example.test");
    await memberPage.goto(new URL("/tasks?clubId=" + clubId + "&mode=member", baseURL).toString());
    const topicTask = memberPage.getByRole("link").filter({ hasText: title });
    await expect(topicTask).toBeVisible();
    await topicTask.click();
    await expect(memberPage.getByRole("heading", { name: title })).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: "具名投票名單" })).toHaveCount(0);
    await memberPage.getByLabel("新增留言").fill(comment);
    await memberPage.getByRole("button", { name: "送出留言" }).click();
    await expect(memberPage.getByText(comment, { exact: true })).toBeVisible();
    await memberPage.getByRole("button", { name: "投這一票" }).first().click();
    await expect(memberPage.getByText("您目前選擇")).toBeVisible();
    await memberPage.goto(new URL("/tasks?clubId=" + clubId + "&mode=member", baseURL).toString());
    await expect(memberPage.getByRole("link").filter({ hasText: title })).toHaveCount(0);

    await page.goto(new URL("/clubs/" + clubId + "/topics?mode=management", baseURL).toString());
    const detailLink = page.getByRole("link").filter({ hasText: title }).first();
    await detailLink.click();
    await expect(page.getByRole("heading", { name: "具名投票名單" })).toBeVisible();
    await expect(page.locator("ul").filter({ hasText: "一般社員" }).getByText("一般社員", { exact: true })).toBeVisible();
  } finally {
    await memberContext.close();
  }
});
