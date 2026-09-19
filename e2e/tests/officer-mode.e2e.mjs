import { expect, test } from "@playwright/test";
import { openEveryEventDetails } from "./member-event-list.mjs";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// A member of the club who also holds management roles there: a president.
const officerEmail = "e2e-shell-member-manager@example.test";
// Manages a club without belonging to it: an executive secretary.
const operatorEmail = "e2e-shell-management@example.test";
const ordinaryMemberEmail = "e2e-shell-ordinary@example.test";
const memberClubId = "a1000000-0000-4000-8000-000000000001";
const managedClubId = "a1000000-0000-4000-8000-000000000003";

const backToMemberName = /^(回社員模式|返回)$/u;

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for officer mode browser tests.");
}

async function login(page, email) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function openManagementFromAccountMenu(page) {
  await page.getByLabel("帳號選單").click();
  const intoManagement = page.getByRole("link", { name: "進入社務管理" });
  await expect(intoManagement).toBeVisible();
  await intoManagement.click();
}

test("an officer in member mode sees the events page a plain member sees", async ({ page }) => {
  await login(page, officerEmail);
  await page.goto(new URL("/events?mode=member", baseURL).toString());
  await expect(page.getByRole("heading", { name: "活動與報名" })).toBeVisible();

  // None of the management affordances belong in the member view.
  await expect(page.getByRole("heading", { name: "建立活動草稿" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "發布活動" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "取消活動" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(上傳圖片|更換圖片)$/u })).toHaveCount(0);

  // Each event is collapsed now, so what is inside a card is reached the way a
  // member reaches it -- including the management routes that must not be here.
  await openEveryEventDetails(page);
  await expect(page.getByRole("link", { name: "管理簽到" })).toHaveCount(0);
  // 本人簽到 is not a management affordance: it is how a member signs themselves
  // in, and this officer is a member of this club.
  await expect(page.getByRole("link", { name: "本人簽到" }).first()).toBeVisible();

  // Drafts are a manager's business; a member never sees one.
  await expect(page.getByText("草稿", { exact: true })).toHaveCount(0);

  // But the officer is still a member, so they register and check in as one.
  await expect(page.getByRole("button", { name: "儲存報名狀態" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "本人簽到" }).first()).toBeVisible();
});

test("the same officer still gets the full management view in management mode", async ({ page }) => {
  await login(page, officerEmail);
  await page.goto(new URL("/events?mode=management", baseURL).toString());

  // The old URL is only a compatibility redirect; the canonical page is now
  // under the selected club's management namespace.
  await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]+\/events\?mode=management$/u);
  await expect(page.getByRole("heading", { name: "建立活動草稿" })).toBeVisible();
  await expect(page.getByRole("link", { name: "管理簽到" }).first()).toBeVisible();
});

/**
 * The document must not be wider than the window.
 *
 * A wide table is fine -- .table-wrap scrolls it. What is not fine is the table
 * widening the page itself, which puts every fixed overlay (the account menu,
 * the bottom navigation) over content that has scrolled out from under it.
 */
async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow, "the page is wider than the phone it is on").toBeLessThanOrEqual(1);
}

test("the member roster fits the phone it is read on", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "officer-mode-375", "a width question");
  await login(page, officerEmail);
  // The roster is the widest table in management mode and the page the account
  // menu's 進入社務管理 lands on, so an overflow here is felt immediately.
  await page.goto(new URL(`/clubs/${memberClubId}/members?mode=management`, baseURL).toString());
  await expect(page.getByRole("heading", { name: "社員", level: 1 })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // And it still fits once the roster has rows in it.
  await expect(page.getByRole("table").last()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // And with a tag wide enough to prove the point. This page carries a second
  // table -- 社員標籤 -- inside a card, and a card was not told it may shrink
  // below its content, so the card grew to the table's natural width and took
  // the page with it while the scroller inside never scrolled.
  //
  // It used to fail here only by luck: the widest tag in this club is created
  // and archived by member-tags.e2e.mjs, running in parallel, so whether this
  // page was over 375px depended on the timing of a different file. Asserted
  // with a tag of its own, it is a width question with a fixed answer.
  //
  // Scoped to the 社員標籤 card: a tag name appears there and again in the
  // batch-tagging control below the roster, so an unscoped getByText matches
  // two elements and fails on strict mode rather than on the width.
  const tagCard = page.locator("#member-tags");
  const tagName = `名冊寬度測試標籤 ${Date.now()}`;
  await page.getByLabel("標籤名稱").fill(tagName);
  await page.getByLabel("說明（選填）").fill("理事、監事與各委員會主委，用於指定活動與訊息對象");
  await page.getByRole("button", { name: "建立標籤" }).click();
  const tagRow = tagCard.locator("tr").filter({ hasText: tagName });
  await expect(tagRow).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await tagRow.getByRole("button", { name: "封存" }).click();
  await expect(tagCard.locator("tr").filter({ hasText: tagName })).toHaveCount(0);
});

test("an officer can leave management mode again", async ({ page }) => {
  await login(page, officerEmail);
  await page.goto(new URL("/dashboard?mode=member", baseURL).toString());

  // Into management from the account menu...
  await openManagementFromAccountMenu(page);
  await expect(page).toHaveURL(/mode=management/u);

  // ...and back out, which is what used to be a one-way door.
  await page.getByLabel("帳號選單").click();
  const backToMember = page.getByRole("link", { name: backToMemberName });
  await expect(backToMember).toBeVisible();
  await backToMember.click();
  await expect(page).toHaveURL(/mode=member/u);
  // Back in member mode the way in is offered again, which is the round trip.
  await openManagementFromAccountMenu(page);
});

test("an operator with no membership is not offered a member mode to return to", async ({ page }) => {
  await login(page, operatorEmail);
  await page.goto(new URL("/dashboard", baseURL).toString());

  await expect(page.getByRole("link", { name: backToMemberName })).toHaveCount(0);
  // Their normal management navigation now enters the canonical club route;
  // the old member URL no longer exposes a manager surface.
  await page.goto(new URL("/dashboard?mode=management", baseURL).toString());
  await page.getByRole("link", { name: "活動", exact: true }).click();
  await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]+\/events\?mode=management$/u);
  await expect(page.getByRole("heading", { name: "建立活動草稿" })).toBeVisible();
});

test("an ordinary member is denied every canonical management route", async ({ page }) => {
  await login(page, ordinaryMemberEmail);

  for (const [path, testId] of [
    [`/clubs/${managedClubId}/birthday-collection?mode=management`, "birthday-collection-management"],
    [`/clubs/${managedClubId}/archives?mode=management`, "archive-management"],
    [`/clubs/${managedClubId}/events?mode=management`, "event-management"],
  ]) {
    await page.goto(new URL(path, baseURL).toString());
    await expect(page).toHaveURL(/\/access-denied(?:\?|$)/u);
    await expect(page.getByTestId(testId)).toHaveCount(0);
  }
});

test("a manager cannot use another club id to open a management route", async ({ page }) => {
  await login(page, officerEmail);

  for (const path of [
    `/clubs/${managedClubId}/birthday-collection?mode=management`,
    `/clubs/${managedClubId}/archives?mode=management`,
    `/clubs/${managedClubId}/events?mode=management`,
  ]) {
    await page.goto(new URL(path, baseURL).toString());
    await expect(page).toHaveURL(/\/access-denied(?:\?|$)/u);
  }

  // The same account still owns its own club route; this guards against a
  // denial check that accidentally removes the legitimate tenant.
  await page.goto(new URL(`/clubs/${memberClubId}/events?mode=management`, baseURL).toString());
  await expect(page).toHaveURL(/\/clubs\/a1000000-0000-4000-8000-000000000001\/events\?mode=management$/u);
  await expect(page.getByRole("heading", { name: "建立活動草稿" })).toBeVisible();
});

test("an officer sees finance only in management mode and a member sees only their own ledger", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "officer-mode-1440", "This flow mutates shared local finance fixtures.");
  test.setTimeout(120_000);

  await login(page, officerEmail);
  await page.goto(new URL("/dashboard?mode=management", baseURL).toString());
  await page.getByTestId("management-card-dues-finance").click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${memberClubId}/dues\\?mode=management$`, "u"));
  await expect(page.getByRole("heading", { name: "社費與核銷" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "收款名單" })).toBeVisible();
  await expect(page.getByText("本機 E2E 收款")).toBeVisible();
  await expect(page.getByText("本機財務頁面驗收代墊")).toBeVisible();

  const downloads = [
    ["下載 CSV", "text/csv", "csv"],
    ["下載 Excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
    ["下載 PDF", "application/pdf", "pdf"],
  ];
  for (const [label, contentType, format] of downloads) {
    const link = page.getByRole("link", { name: label });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toContain(`format=${format}`);
    const response = await page.request.get(new URL(href, baseURL).toString());
    expect(response.status(), `${label} should return a protected finance download`).toBe(200);
    expect(response.headers()["content-type"]).toContain(contentType);
    expect(response.headers()["content-disposition"]).toContain("attachment");
    expect(response.headers()["cache-control"]).toContain("no-store");
    const body = await response.body();
    if (format === "csv") {
      const csv = body.toString("utf8");
      expect(csv.codePointAt(0)).toBe(0xfeff);
      expect(csv).toContain("一般社員");
    } else if (format === "xlsx") {
      expect(body.subarray(0, 2).toString("ascii")).toBe("PK");
    } else {
      expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    }
  }

  const memberContext = await page.context().browser().newContext({ baseURL });
  const memberPage = await memberContext.newPage();
  try {
    await login(memberPage, ordinaryMemberEmail);
    await memberPage.goto(new URL(`/dues?clubId=${memberClubId}&mode=member`, baseURL).toString());
    await expect(memberPage.getByRole("heading", { name: "我的社費" })).toBeVisible();
    await expect(memberPage.getByRole("heading", { name: "應收與收款" })).toBeVisible();
    await expect(memberPage.getByText("收款名單")).toHaveCount(0);
    await expect(memberPage.getByRole("heading", { name: "社費與核銷" })).toHaveCount(0);
    await expect(memberPage.getByText("本機 E2E 收款")).toBeVisible();
    await expect(memberPage.getByText("本機財務頁面驗收代墊")).toBeVisible();
  } finally {
    await memberContext.close();
  }
});

test("a service-plan manager keeps drafts private until publishing", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "officer-mode-1440", "This flow mutates shared local service-plan fixtures.");
  test.setTimeout(120_000);

  const startYear = 2000 + (Date.now() % 200);
  const title = `本機服務計劃驗收 ${Date.now()}`;
  const serviceCategories = ["社員服務", "職業服務", "社區服務", "國際服務"];

  await login(page, officerEmail);
  await page.goto(new URL(`/clubs/${memberClubId}/service-plan?mode=management&year=${startYear}`, baseURL).toString());
  await expect(page.getByRole("heading", { name: "年度服務計劃", level: 1 })).toBeVisible();

  await page.getByLabel("計劃標題").fill(title);
  await page.getByLabel("年度總覽").fill("本機驗收：先建立草稿，再由幹部確認後公開。");
  await page.locator('textarea[name="memberInvitation"]').fill("本機驗收：社員可以在發布後查看四大服務面向。");
  for (let index = 0; index < serviceCategories.length; index += 1) {
    await page.getByLabel("年度目標").nth(index).fill(`${serviceCategories[index]}年度目標`);
    await page.getByLabel("執行活動").nth(index).fill(`${serviceCategories[index]}執行活動`);
    await page.getByLabel("最新成果").nth(index).fill(`${serviceCategories[index]}最新成果`);
    await page.locator('textarea[name$="_memberParticipation"]').nth(index).fill(`${serviceCategories[index]}社員參與`);
  }

  await page.getByRole("button", { name: "儲存草稿" }).click();
  await expect(page).toHaveURL(/success=saved/u, { timeout: 30_000 });

  const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const memberPage = await memberContext.newPage();
  try {
    await login(memberPage, ordinaryMemberEmail);
    await memberPage.goto(new URL(`/club-affairs?mode=member&year=${startYear}`, baseURL).toString());
    await expect(memberPage.getByText("本年度的服務計劃尚未發布。", { exact: true })).toBeVisible();
    await expect(memberPage.getByText(title, { exact: true })).toHaveCount(0);

    await page.goto(new URL(`/clubs/${memberClubId}/service-plan?mode=management&year=${startYear}`, baseURL).toString());
    await page.getByRole("button", { name: "發布給社員" }).click();
    await expect(page).toHaveURL(/success=saved/u, { timeout: 30_000 });

    await memberPage.goto(new URL(`/club-affairs?mode=member&year=${startYear}`, baseURL).toString());
    await expect(memberPage.getByText(title, { exact: true })).toBeVisible();
    for (const category of serviceCategories) {
      await expect(memberPage.getByRole("heading", { name: category, exact: true })).toBeVisible();
    }
  } finally {
    await memberContext.close();
  }
});

test("an executive secretary reaches birthday management from the overview", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "officer-mode-1440", "This flow mutates shared local birthday fixtures.");
  test.setTimeout(90_000);

  await login(page, operatorEmail);
  await page.goto(new URL("/dashboard?mode=management", baseURL).toString());
  await page.getByTestId("management-card-birthday-collection").click();
  await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]+\/birthday-collection\?mode=management$/u);
  await expect(page.getByTestId("birthday-collection-management")).toBeVisible();

  await page.getByRole("button", { name: "建立／重跑本月任務" }).click();
  await expect(page).toHaveURL(/success=(generated|generated_notification_skipped)/u, { timeout: 30_000 });
});

test("an executive secretary can create, edit and upload a disposable archive item", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "officer-mode-1440", "This flow mutates shared local archive fixtures.");
  test.setTimeout(120_000);

  await login(page, operatorEmail);
  await page.goto(new URL("/dashboard?mode=management", baseURL).toString());
  await page.getByTestId("management-card-archives").click();
  await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]+\/archives\?mode=management$/u);
  await expect(page.getByTestId("archive-management")).toBeVisible();

  const startYear = 2000 + (Date.now() % 200);
  const yearDetails = page.locator("details").filter({ hasText: "建立扶輪年度" }).first();
  if (!(await yearDetails.evaluate((element) => element instanceof HTMLDetailsElement && element.open))) {
    await yearDetails.locator("summary").click();
  }
  const yearForm = yearDetails.locator("form");
  await yearForm.getByLabel("起始年份").fill(String(startYear));
  await yearForm.getByLabel("年度主題").fill("可回收文件驗收");
  await yearForm.getByRole("button", { name: "建立年度與清單" }).click();
  await expect(page).toHaveURL(/success=year_created/u, { timeout: 30_000 });

  const itemTitle = `可回收文件驗收 ${Date.now()}`;
  const itemDetails = page.locator("details").filter({ hasText: "建立文件項目" }).first();
  if (!(await itemDetails.evaluate((element) => element instanceof HTMLDetailsElement && element.open))) {
    await itemDetails.locator("summary").click();
  }
  const itemForm = itemDetails.locator("form");
  await itemForm.getByLabel("標題").fill(itemTitle);
  await itemForm.getByLabel("資料夾").fill("e2e-disposable");
  await itemForm.getByLabel("標籤").fill("e2e, disposable");
  await itemForm.getByLabel("說明").fill("供管理模式驗收後保留作為可回收測試資料。");
  await itemForm.getByRole("button", { name: "建立文件項目" }).click();
  await expect(page).toHaveURL(/success=item_created/u, { timeout: 30_000 });

  const itemCard = page.locator("section.card").filter({ hasText: itemTitle }).first();
  await expect(itemCard).toBeVisible();
  const uploadDetails = itemCard.locator("details").filter({ hasText: "上傳新版本" }).first();
  if (!(await uploadDetails.evaluate((element) => element instanceof HTMLDetailsElement && element.open))) {
    await uploadDetails.locator("summary").click();
  }
  await uploadDetails.locator('input[name="file"]').setInputFiles({
    name: "handover-acceptance.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("可回收文件驗收\n"),
  });
  await uploadDetails.getByLabel("版本說明").fill("管理模式上傳驗收");
  await uploadDetails.getByRole("button", { name: "上傳新版本" }).click();
  await expect(page).toHaveURL(/success=version_uploaded/u, { timeout: 30_000 });
  await expect(page.getByText("handover-acceptance.txt", { exact: true })).toBeVisible();

  const updatedTitle = `${itemTitle}（已編輯）`;
  const updatedCard = page.locator("section.card").filter({ hasText: itemTitle }).first();
  const editDetails = updatedCard.locator("details").filter({ hasText: "修改文件說明" }).first();
  if (!(await editDetails.evaluate((element) => element instanceof HTMLDetailsElement && element.open))) {
    await editDetails.locator("summary").click();
  }
  await editDetails.getByLabel("標題").fill(updatedTitle);
  await editDetails.getByRole("button", { name: "儲存文件說明" }).click();
  await expect(page).toHaveURL(/success=item_updated/u, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: updatedTitle, exact: true })).toBeVisible();
});
