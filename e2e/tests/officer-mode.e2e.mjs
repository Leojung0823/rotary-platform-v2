import { expect, test } from "@playwright/test";

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
  await expect(page.getByRole("link", { name: "管理簽到" }).first()).toBeVisible();

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
