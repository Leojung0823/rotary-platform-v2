import { expect, test } from "@playwright/test";
import { isPublicHostname } from "../../src/lib/public-hostname.mjs";

const memberEmail = process.env.STAGING_TEST_MEMBER_EMAIL;
const memberPassword = process.env.STAGING_TEST_MEMBER_PASSWORD;
const expectedClubName = process.env.STAGING_EXPECTED_CLUB_NAME;
const expectedSha = process.env.E2E_EXPECTED_SHA;
const baseURL = process.env.E2E_BASE_URL;

function requireStagingConfiguration() {
  if (!memberEmail || !memberPassword || !expectedClubName || !expectedSha || !baseURL) {
    throw new Error("Protected staging acceptance configuration is incomplete.");
  }

  const parsed = new URL(baseURL);
  if (parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
    || !isPublicHostname(parsed.hostname)) {
    throw new Error("Staging acceptance requires a public, credential-free HTTPS origin.");
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
  await page.getByLabel("電子郵件").fill(memberEmail);
  await page.getByLabel("密碼").fill(memberPassword);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await expect(page.getByRole("heading", { level: 1, name: /，您好$/u })).toBeVisible();
}

test.describe("受保護的 Hosted staging 社員驗收", () => {
  test.skip(process.env.E2E_REMOTE !== "1", "Hosted staging acceptance only runs in protected remote mode.");

  test.beforeAll(() => {
    requireStagingConfiguration();
  });

  test("部署版本、登入、名冊、會員中心與登出形成閉環", async ({ page, request }) => {
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
    await expectNoHorizontalOverflow(page);

    await page.goto("/directory");
    await expect(page.getByRole("heading", { level: 1, name: "社員名冊" })).toBeVisible();
    await expect(page.getByLabel("扶輪社").getByRole("option", { name: expectedClubName })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2, name: expectedClubName })).toBeVisible();
    await expect(page.getByText("目前無法載入您可查看的社員名冊。", { exact: true })).toHaveCount(0);
    await expect(page.getByText("目前無法讀取這個扶輪社的社員名冊。", { exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.goto("/me");
    await expect(page.locator("main").getByText("會員中心", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "基本資料" })).toBeVisible();
    await expect(page.getByRole("button", { name: "儲存基本資料" })).toBeVisible();
    const displayNameLength = (await page.getByLabel("姓名").inputValue()).trim().length;
    const contactLength = Math.max(
      (await page.getByLabel("手機").inputValue()).trim().length,
      (await page.getByLabel("Email").inputValue()).trim().length,
    );
    expect(displayNameLength).toBeGreaterThan(0);
    expect(contactLength).toBeGreaterThan(0);
    await expectNoHorizontalOverflow(page);

    await page.getByRole("complementary").getByRole("button", { name: "登出" }).click();
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/u);
    await expect(page.getByRole("heading", { level: 1, name: "歡迎回來" })).toBeVisible();
  });
});
