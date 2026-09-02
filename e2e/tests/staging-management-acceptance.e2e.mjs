import { expect, test } from "@playwright/test";
import { isPublicHostname } from "../../src/lib/public-hostname.mjs";

const operatorEmail = process.env.STAGING_TEST_OPERATOR_EMAIL;
const operatorPassword = process.env.STAGING_TEST_OPERATOR_PASSWORD;
const expectedClubName = process.env.STAGING_EXPECTED_CLUB_NAME;
const expectedSha = process.env.E2E_EXPECTED_SHA;
const baseURL = process.env.E2E_BASE_URL;
const backToMemberName = /^(回社員模式|返回)$/u;

function requireStagingConfiguration() {
  if (!operatorEmail || !operatorPassword || !expectedClubName || !expectedSha || !baseURL) {
    throw new Error("Protected staging management acceptance configuration is incomplete.");
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

async function login(page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "歡迎回來" })).toBeVisible();
  await page.getByLabel("電子郵件").fill(operatorEmail);
  await page.getByLabel("密碼").fill(operatorPassword);
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

test.describe("受保護的 Hosted staging 執行秘書驗收", () => {
  test.skip(process.env.E2E_REMOTE !== "1", "Hosted staging acceptance only runs in protected remote mode.");

  test.beforeAll(() => {
    requireStagingConfiguration();
  });

  test("從管理總覽完成生日重跑與文件建立、上傳、編輯", async ({ page, request }) => {
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

    await login(page);
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
});
