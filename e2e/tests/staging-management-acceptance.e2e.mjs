import { expect, test } from "@playwright/test";
import { isPublicHostname } from "../../src/lib/public-hostname.mjs";

const operatorEmail = process.env.STAGING_TEST_OPERATOR_EMAIL;
const operatorPassword = process.env.STAGING_TEST_OPERATOR_PASSWORD;
const memberEmail = process.env.STAGING_TEST_MEMBER_EMAIL;
const memberPassword = process.env.STAGING_TEST_MEMBER_PASSWORD;
const expectedClubName = process.env.STAGING_EXPECTED_CLUB_NAME;
const expectedSha = process.env.E2E_EXPECTED_SHA;
const baseURL = process.env.E2E_BASE_URL;
const backToMemberName = /^(回社員模式|返回)$/u;

function requireStagingConfiguration() {
  if (!operatorEmail || !operatorPassword || !memberEmail || !memberPassword
    || !expectedClubName || !expectedSha || !baseURL) {
    throw new Error("Protected staging management acceptance test identities are incomplete.");
  }

  const parsed = new URL(baseURL);
  if (parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
    || !isPublicHostname(parsed.hostname)) {
    throw new Error("Staging management acceptance requires a public, credential-free HTTPS origin.");
  }
  if (!/^[a-f0-9]{40}$/u.test(expectedSha)) {
    throw new Error("E2E_EXPECTED_SHA must be an exact 40-character commit SHA.");
  }
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

async function login(page, email, password) {
  await page.goto(new URL("/login", baseURL).toString());
  await expect(page.getByRole("heading", { level: 1, name: "歡迎回來" })).toBeVisible();
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function openManagementOverview(page) {
  await page.goto("/dashboard?mode=management");
  await expect(page.getByText(expectedClubName, { exact: true }).first()).toBeVisible();
  // A real executive secretary has no membership and therefore must not get a
  // misleading "back to member mode" link.
  await expect(page.getByRole("link", { name: backToMemberName })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
}

function startYearFromLabel(label) {
  const match = label.match(/^\s*(\d{4})/u);
  return match ? Number(match[1]) : null;
}

async function chooseUnusedYear(page) {
  const labels = await page.locator('nav[aria-label="扶輪年度"] a').allTextContents();
  const occupied = new Set(labels.map(startYearFromLabel).filter((year) => Number.isInteger(year)));
  const currentYear = new Date().getFullYear();
  const first = 2000 + ((currentYear - 2000) % 201);
  for (let offset = 0; offset <= 200; offset += 1) {
    const candidate = 2000 + ((first - 2000 + offset) % 201);
    if (!occupied.has(candidate)) return candidate;
  }
  throw new Error("No disposable staging Rotary year remains.");
}

function dateTimeLocalFromNow(daysFromNow, hour, minute = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(hour)}:${pad(minute)}`;
}

function dateOnlyFromNow(daysFromNow = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

async function expectFinanceDownloads(page, expectedCsvText = null) {
  const downloads = [
    ["下載 CSV", "text/csv", "csv"],
    ["下載 Excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
    ["下載 PDF", "application/pdf", "pdf"],
  ];

  for (const [label, contentType, format] of downloads) {
    const link = page.getByRole("link", { name: label });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    if (!href) throw new Error(`${label} link is missing its href.`);
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
      if (expectedCsvText) expect(csv).toContain(expectedCsvText);
    } else if (format === "xlsx") {
      expect(body.subarray(0, 2).toString("ascii")).toBe("PK");
    } else {
      expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    }
  }
}

async function createDisposableRotaryYear(page, clubId, theme) {
  await page.goto(new URL(`/clubs/${clubId}/archives?mode=management`, baseURL).toString());
  await expect(page.getByTestId("archive-management")).toBeVisible();

  const startYear = await chooseUnusedYear(page);
  const yearDetails = page.locator("details").filter({ hasText: "建立扶輪年度" }).first();
  if (!(await yearDetails.evaluate((element) => element instanceof HTMLDetailsElement && element.open))) {
    await yearDetails.locator("summary").click();
  }
  const yearForm = yearDetails.locator("form");
  await yearForm.getByLabel("起始年份").fill(String(startYear));
  await yearForm.getByLabel("年度主題").fill(theme);
  await yearForm.getByRole("button", { name: "建立年度與清單" }).click();
  await expect(page).toHaveURL(/success=year_created/u, { timeout: 30_000 });

  await page.goto(new URL(`/clubs/${clubId}/dues?mode=management`, baseURL).toString());
  await expect(page.getByRole("heading", { name: "社費與核銷" })).toBeVisible();
  const yearLink = page.locator('nav[aria-label="社費扶輪年度"] a').filter({ hasText: String(startYear) }).first();
  await expect(yearLink).toHaveCount(1);
  const href = await yearLink.getAttribute("href");
  if (!href) throw new Error("Disposable finance Rotary year link is missing.");
  const yearUrl = new URL(href, baseURL);
  await page.goto(yearUrl.toString());
  await expect(page.getByRole("heading", { name: "社費與核銷" })).toBeVisible();
  return { startYear, yearId: yearUrl.searchParams.get("yearId") };
}

async function smallPngBytes(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    context.fillStyle = "#1677a8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("png_unavailable");
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
}

test.describe("受保護的 Hosted staging 執行秘書驗收", () => {
  test.skip(process.env.E2E_REMOTE !== "1", "Hosted staging acceptance only runs in protected remote mode.");

  test.beforeAll(() => {
    requireStagingConfiguration();
  });

  test("從管理總覽完成生日重跑、服務計劃與文件驗收", async ({ page, request, browser }) => {
    test.setTimeout(150_000);

    const healthResponse = await request.get("/api/health", {
      headers: { "cache-control": "no-cache" },
    });
    expect(healthResponse.status()).toBe(200);
    const health = await healthResponse.json();
    expect(health.status).toBe("ok");
    expect(health.environment).toBe("staging");
    expect(health.revision).toBe(expectedSha.slice(0, 12));
    expect(health.checks?.configuration).toBe(true);
    expect(health.checks?.database).toBe(true);
    expect(health.issues).toEqual([]);

    await login(page, operatorEmail, operatorPassword);
    await openManagementOverview(page);

    const servicePlanYear = await chooseUnusedYear(page);
    const servicePlanTitle = `staging 服務計劃驗收 ${Date.now()}`;
    const servicePlanCard = page.getByTestId("management-card-service-plan");
    await servicePlanCard.click();
    await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]{36}\/service-plan\?mode=management$/u);
    const servicePlanUrl = new URL(page.url());
    const servicePlanClubId = servicePlanUrl.pathname.split("/")[2];
    expect(servicePlanClubId).toMatch(/^[0-9a-f-]{36}$/u);
    await page.goto(new URL(
      `/clubs/${servicePlanClubId}/service-plan?mode=management&year=${servicePlanYear}`,
      baseURL,
    ).toString());
    await expect(page.getByRole("heading", { name: "年度服務計劃", level: 1 })).toBeVisible();

    const serviceCategories = ["社員服務", "職業服務", "社區服務", "國際服務"];
    await page.getByLabel("計劃標題").fill(servicePlanTitle);
    await page.getByLabel("年度總覽").fill("staging 驗收：草稿只有管理者可見，發布後才給社員閱讀。");
    await page.locator('textarea[name="memberInvitation"]').fill("staging 驗收：社員可在發布後查看四大服務面向。");
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
      await login(memberPage, memberEmail, memberPassword);
      await memberPage.goto(new URL(`/club-affairs?mode=member&year=${servicePlanYear}`, baseURL).toString());
      await expect(memberPage.getByText("本年度的服務計劃尚未發布。", { exact: true })).toBeVisible();
      await expect(memberPage.getByText(servicePlanTitle, { exact: true })).toHaveCount(0);

      await page.goto(new URL(
        `/clubs/${servicePlanClubId}/service-plan?mode=management&year=${servicePlanYear}`,
        baseURL,
      ).toString());
      await page.getByRole("button", { name: "發布給社員" }).click();
      await expect(page).toHaveURL(/success=saved/u, { timeout: 30_000 });

      await memberPage.goto(new URL(`/club-affairs?mode=member&year=${servicePlanYear}`, baseURL).toString());
      await expect(memberPage.getByText(servicePlanTitle, { exact: true })).toBeVisible();
      for (const category of serviceCategories) {
        await expect(memberPage.getByRole("heading", { name: category, exact: true })).toBeVisible();
      }

      await page.goto(new URL(
        `/clubs/${servicePlanClubId}/service-plan?mode=management&year=${servicePlanYear}`,
        baseURL,
      ).toString());
      await page.getByRole("button", { name: "儲存草稿" }).click();
      await expect(page).toHaveURL(/success=saved/u, { timeout: 30_000 });
      await memberPage.goto(new URL(`/club-affairs?mode=member&year=${servicePlanYear}`, baseURL).toString());
      await expect(memberPage.getByText("本年度的服務計劃尚未發布。", { exact: true })).toBeVisible();
      await expect(memberPage.getByText(servicePlanTitle, { exact: true })).toHaveCount(0);
    } finally {
      await memberContext.close();
    }

    await openManagementOverview(page);
    await page.getByTestId("management-card-birthday-collection").click();
    await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]{36}\/birthday-collection\?mode=management$/u);
    await expect(page.getByTestId("birthday-collection-management")).toBeVisible();
    await page.getByRole("button", { name: "建立／重跑本月任務" }).click();
    await expect(page).toHaveURL(/success=(generated|generated_notification_skipped)/u, { timeout: 30_000 });

    await openManagementOverview(page);
    await page.getByTestId("management-card-archives").click();
    await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]{36}\/archives\?mode=management$/u);
    await expect(page.getByTestId("archive-management")).toBeVisible();

    const startYear = await chooseUnusedYear(page);
    const yearDetails = page.locator("details").filter({ hasText: "建立扶輪年度" }).first();
    if (!(await yearDetails.evaluate((element) => element instanceof HTMLDetailsElement && element.open))) {
      await yearDetails.locator("summary").click();
    }
    const yearForm = yearDetails.locator("form");
    await yearForm.getByLabel("起始年份").fill(String(startYear));
    await yearForm.getByLabel("年度主題").fill("可回收管理模式驗收");
    await yearForm.getByRole("button", { name: "建立年度與清單" }).click();
    await expect(page).toHaveURL(/success=year_created/u, { timeout: 30_000 });

    const itemTitle = `可回收管理模式驗收 ${Date.now()}`;
    const itemDetails = page.locator("details").filter({ hasText: "建立文件項目" }).first();
    if (!(await itemDetails.evaluate((element) => element instanceof HTMLDetailsElement && element.open))) {
      await itemDetails.locator("summary").click();
    }
    const itemForm = itemDetails.locator("form");
    await itemForm.getByLabel("標題").fill(itemTitle);
    await itemForm.getByLabel("資料夾").fill("staging-management-acceptance");
    await itemForm.getByLabel("標籤").fill("staging, acceptance, disposable");
    await itemForm.getByLabel("說明").fill("供 staging 管理模式驗收後回收的測試文件。");
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
      buffer: Buffer.from("staging management acceptance\n"),
    });
    await uploadDetails.getByLabel("版本說明").fill("staging 管理模式上傳驗收");
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
    await expectNoHorizontalOverflow(page);
  });

  test("從管理總覽完成活動建立、封面上傳、發布與取消", async ({ page }) => {
    test.setTimeout(180_000);

    await login(page, operatorEmail, operatorPassword);
    await openManagementOverview(page);

    // Activities are a first-level management destination, not a low-frequency
    // overview card. Keep this acceptance aligned with the management shell so
    // the test proves the real operator path instead of requiring a duplicate
    // entry that the product intentionally does not render.
    await page.getByRole("link", { name: "活動", exact: true }).click();
    await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]{36}\/events\?mode=management$/u);
    await expect(page.getByTestId("event-management")).toBeVisible();

    const eventTitle = `staging 活動驗收 ${Date.now()}`;
    const createForm = page.getByTestId("event-management").locator("section.card").first().locator("form");
    await createForm.getByLabel("活動類型").selectOption("regular_meeting");
    await createForm.getByLabel("活動名稱").fill(eventTitle);
    await createForm.getByLabel("開始時間（台北）").fill(dateTimeLocalFromNow(30, 10));
    await createForm.getByLabel("結束時間（台北）").fill(dateTimeLocalFromNow(30, 11));
    await createForm.getByLabel("報名截止（台北，選填）").fill(dateTimeLocalFromNow(29, 18));
    await createForm.getByLabel("名額（留空表示不限）").fill("20");
    await createForm.getByLabel("地點").fill("staging 驗收測試場地");
    await createForm.getByLabel("活動說明").fill("供管理模式驗收後保留的可回收測試活動。");
    await createForm.getByRole("button", { name: "建立草稿" }).click();
    await expect(page).toHaveURL(/success=event_created/u, { timeout: 30_000 });

    let eventCard = page.locator("article.card").filter({ hasText: eventTitle }).first();
    await expect(eventCard).toBeVisible();
    await expect(eventCard.getByText("草稿", { exact: true })).toBeVisible();

    const imageBytes = await smallPngBytes(page);
    await eventCard.locator('input[type="file"]').setInputFiles({
      name: "staging-event-cover.png",
      mimeType: "image/png",
      buffer: Buffer.from(imageBytes),
    });
    await expect(eventCard.getByText("圖片已更新。", { exact: true })).toBeVisible({ timeout: 30_000 });

    // The client shows success before the server action finishes recording the
    // path. Reload until the signed URL is present, proving the Storage write
    // and event projection both completed.
    await expect.poll(async () => {
      await page.reload();
      return await page.locator("article.card").filter({ hasText: eventTitle }).locator("img.event-cover").count();
    }, { timeout: 30_000, intervals: [500, 1_000, 2_000] }).toBe(1);
    eventCard = page.locator("article.card").filter({ hasText: eventTitle }).first();
    // The poster is folded away on the management list so an officer can scan
    // the events without scrolling past a full-width image for each. Opening
    // the fold is what an officer does to look at one.
    await eventCard.locator("details.cover-fold > summary").first().click();
    const cover = eventCard.locator("img.event-cover").first();
    await cover.scrollIntoViewIfNeeded();
    await expect(cover).toBeVisible();
    await expect.poll(
      () => cover.evaluate((image) => image.naturalWidth),
      { timeout: 15_000 },
    ).toBeGreaterThan(0);
    expect(await cover.getAttribute("src")).toContain("token=");

    await eventCard.getByRole("button", { name: "發布活動" }).click();
    await expect(page).toHaveURL(/success=event_published/u, { timeout: 30_000 });
    eventCard = page.locator("article.card").filter({ hasText: eventTitle }).first();
    await expect(eventCard.getByText("已發布", { exact: true })).toBeVisible();

    // 取消 is folded away now: a destructive action with a required reason no
    // longer sits open at the foot of every live event.
    const cancelFold = eventCard.locator("details.event-danger");
    await cancelFold.locator("summary").click();
    const cancelForm = cancelFold.locator("form.inline-form");
    await expect(cancelForm).toBeVisible();
    await cancelForm.getByLabel("取消原因").fill("staging 活動驗收完成，保留為可回收測試資料。");
    await cancelForm.getByRole("button", { name: "取消活動" }).click();
    await expect(page).toHaveURL(/success=event_cancelled/u, { timeout: 30_000 });
    // Cancelled events are intentionally filed inside a collapsed archive so
    // the live management list stays scannable. Open that archive before
    // asserting the cancelled event's final state.
    const archiveFold = page.locator("details.archive-fold").filter({
      has: page.locator("article.card").filter({ hasText: eventTitle }),
    });
    await expect(archiveFold).toHaveCount(1);
    await archiveFold.locator(":scope > summary").click();
    eventCard = page.locator("article.card").filter({ hasText: eventTitle }).first();
    await expect(eventCard.getByText("已取消", { exact: true })).toBeVisible();
    await expect(eventCard.getByRole("button", { name: "取消活動" })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("社費管理頁與社員頁維持角色邊界", async ({ page, browser }) => {
    test.setTimeout(90_000);

    await login(page, operatorEmail, operatorPassword);
    await openManagementOverview(page);

    const duesCard = page.getByTestId("management-card-dues-finance");
    await expect(duesCard).toBeVisible();
    await duesCard.click();
    await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]{36}\/dues\?mode=management$/u);
    const duesUrl = new URL(page.url());
    const clubId = duesUrl.pathname.split("/")[2];
    expect(clubId).toMatch(/^[0-9a-f-]{36}$/u);
    await expect(page.getByRole("heading", { name: "社費與核銷" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "收款名單" })).toBeVisible();
    await expectFinanceDownloads(page);
    const csvHref = await page.getByRole("link", { name: "下載 CSV" }).getAttribute("href");
    if (!csvHref) throw new Error("Management CSV export link is missing.");
    const managementCsvUrl = new URL(csvHref, baseURL);

    const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const memberPage = await memberContext.newPage();
    try {
      await login(memberPage, memberEmail, memberPassword);
      await memberPage.goto(new URL(`/dues?clubId=${clubId}&mode=member`, baseURL).toString());
      await expect(memberPage.getByRole("heading", { name: "我的社費" })).toBeVisible();
      await expect(memberPage.getByRole("heading", { name: "應收與收款" })).toBeVisible();
      await expect(memberPage.getByRole("heading", { name: "社費與核銷" })).toHaveCount(0);
      await expect(memberPage.getByRole("heading", { name: "收款名單" })).toHaveCount(0);
      await expect(memberPage.getByRole("button", { name: "送出代墊申請" })).toBeVisible();

      const memberExport = await memberPage.request.get(managementCsvUrl.toString());
      expect(memberExport.status()).toBe(403);
      expect(memberExport.headers()["cache-control"]).toContain("no-store");

      await memberPage.goto(new URL(`/clubs/${clubId}/dues?mode=management`, baseURL).toString());
      await expect(memberPage).toHaveURL(/\/access-denied(?:\?|$)/u);
    } finally {
      await memberContext.close();
    }
  });

  test("社費管理頁完成部分收款、代墊與核銷", async ({ page, browser }) => {
    test.setTimeout(180_000);

    await login(page, operatorEmail, operatorPassword);
    await openManagementOverview(page);
    await page.getByTestId("management-card-dues-finance").click();
    await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]{36}\/dues\?mode=management$/u);
    const clubId = new URL(page.url()).pathname.split("/")[2];
    expect(clubId).toMatch(/^[0-9a-f-]{36}$/u);

    const { yearId } = await createDisposableRotaryYear(
      page,
      clubId,
      `可回收社費驗收 ${Date.now()}`,
    );
    expect(yearId).toMatch(/^[0-9a-f-]{36}$/u);

    const setup = page.locator("details").filter({ hasText: "年度設定 · 應收預設與個別應收" }).first();
    if (!(await setup.evaluate((element) => element instanceof HTMLDetailsElement && element.open))) {
      await setup.locator("summary").click();
    }
    await page.getByLabel("每位社員的年度社費").fill("5000");
    await page.getByRole("button", { name: "儲存預設金額" }).click();
    await expect(page.getByText("年度預設金額已儲存。", { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("產生年度應收的備註（選填）").fill("staging 財務驗收年度應收");
    await page.getByRole("button", { name: "產生年度應收" }).click();
    await expect(page.getByText("已為尚未建立應收的社員產生年度應收。", { exact: true })).toBeVisible({ timeout: 30_000 });

    const firstReceiptButton = page.getByRole("button", { name: "收款", exact: true }).first();
    await expect(firstReceiptButton).toBeVisible({ timeout: 30_000 });
    const receiptRow = firstReceiptButton.locator("xpath=ancestor::li[1]");
    const receiptMemberName = await receiptRow.locator("strong").first().textContent();
    if (!receiptMemberName) throw new Error("The staging finance receipt member name is missing.");
    await firstReceiptButton.click();
    await page.getByLabel("本次收款").fill("2000");
    await page.getByRole("button", { name: "確認收款", exact: true }).click();
    await expect(page.getByText("收款已登錄。", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("部分收款", { exact: true })).toBeVisible();
    await expectFinanceDownloads(page, receiptMemberName);

    const advanceForm = page.locator("form").filter({ has: page.getByLabel("代墊社員") }).first();
    const advanceDescription = `staging 財務驗收代墊 ${Date.now()}`;
    await advanceForm.getByLabel("金額").fill("800");
    await advanceForm.getByLabel("支出日期").fill(dateOnlyFromNow());
    await advanceForm.getByLabel("支出說明").fill(advanceDescription);
    await advanceForm.getByRole("button", { name: "送出代墊", exact: true }).click();
    await expect(page.getByText("代墊申請已建立。", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(advanceDescription, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "核准", exact: true }).last().click();
    await expect(page.getByText("核銷已登錄。", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("已結案", { exact: true })).toBeVisible();

    const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const memberPage = await memberContext.newPage();
    try {
      await login(memberPage, memberEmail, memberPassword);
      await memberPage.goto(new URL(`/dues?clubId=${clubId}&yearId=${yearId}&mode=member`, baseURL).toString());
      await expect(memberPage.getByRole("heading", { name: "我的社費" })).toBeVisible();
      await expect(memberPage.getByRole("heading", { name: "應收與收款" })).toBeVisible();
      await expect(memberPage.getByText("年度社費", { exact: true })).toBeVisible();
    } finally {
      await memberContext.close();
    }

    // Keep the hosted test data explicitly reversible. The audit trail remains,
    // but the synthetic receipt, reconciliation, and outstanding amount do not
    // look like real money movement after this test finishes.
    const receiptReversal = page.locator("details").filter({ hasText: "沖銷這筆收款" }).first();
    await receiptReversal.locator("summary").click();
    await receiptReversal.getByLabel("沖銷原因").fill("staging 驗收資料回收");
    await receiptReversal.getByRole("button", { name: "保留紀錄並沖銷" }).click();
    await expect(page.getByText("收款已沖銷，原紀錄仍保留。", { exact: true })).toBeVisible({ timeout: 30_000 });

    const reconciliationReversal = page.locator("details").filter({ hasText: "反向" }).last();
    await reconciliationReversal.locator("summary").click();
    await reconciliationReversal.getByPlaceholder("反向原因").fill("staging 驗收資料回收");
    await reconciliationReversal.getByRole("button", { name: "確認", exact: true }).click();
    await expect(page.getByText("核銷已反向調整，原紀錄仍保留。", { exact: true })).toBeVisible({ timeout: 30_000 });

    const returnedAdvance = page.locator("details").filter({ hasText: "退回申請" }).first();
    await returnedAdvance.locator("summary").click();
    await returnedAdvance.getByLabel("退回原因").fill("staging 驗收資料回收");
    await returnedAdvance.getByRole("button", { name: "退回", exact: true }).click();
    await expect(page.getByText("代墊已退回，社員可修改後重新送出。", { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^全部\s+\d+$/u }).click();
    const receiptMemberRow = page.locator("li").filter({ hasText: receiptMemberName }).filter({ hasText: "調整應收金額" }).first();
    const adjustment = receiptMemberRow.locator("details").filter({ hasText: "調整應收金額" }).first();
    await adjustment.locator("summary").click();
    await adjustment.getByLabel("調整金額").fill("-4999");
    await adjustment.getByLabel("原因").fill("staging 驗收資料回收");
    await adjustment.getByRole("button", { name: "儲存調整" }).click();
    await expect(page.getByText("應收金額已調整。", { exact: true })).toBeVisible({ timeout: 30_000 });
  });
});
