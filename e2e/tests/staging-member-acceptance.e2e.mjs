import { expect, test } from "@playwright/test";
import { isPublicHostname } from "../../src/lib/public-hostname.mjs";

const memberEmail = process.env.STAGING_TEST_MEMBER_EMAIL;
const memberPassword = process.env.STAGING_TEST_MEMBER_PASSWORD;
const expectedClubName = process.env.STAGING_EXPECTED_CLUB_NAME;
const expectedSha = process.env.E2E_EXPECTED_SHA;
const baseURL = process.env.E2E_BASE_URL;
const expectBirthdayV2 = process.env.STAGING_EXPECT_BIRTHDAY_V2 === "true";
const expectBirthdayCollection = process.env.STAGING_EXPECT_BIRTHDAY_COLLECTION === "true";

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
    // The club picker only renders when there's a real choice; the staging
    // test member belongs to exactly one club, so it's correctly absent
    // here. Only assert the option exists when the picker itself does.
    const clubPicker = page.getByLabel("扶輪社");
    if (await clubPicker.count()) {
      await expect(clubPicker.getByRole("option", { name: expectedClubName })).toHaveCount(1);
    }
    await expect(page.getByRole("heading", { level: 2, name: expectedClubName })).toBeVisible();
    await expect(page.getByText("目前無法載入您可查看的社員名冊。", { exact: true })).toHaveCount(0);
    await expect(page.getByText("目前無法讀取這個扶輪社的社員名冊。", { exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.goto("/me");
    await expect(page.locator("main").getByText("會員中心", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "基本資料" })).toBeVisible();
    await expect(page.getByRole("button", { name: "儲存基本資料" })).toBeVisible();
    const displayNameLength = (await page.getByLabel("姓名").inputValue()).trim().length;
    const phoneInput = page.getByRole("textbox", {
      name: "手機",
      exact: true,
    });
    const emailInput = page.getByRole("textbox", {
      name: "Email",
      exact: true,
    });
    await expect(phoneInput).toHaveCount(1);
    await expect(emailInput).toHaveCount(1);
    const contactLength = Math.max(
      (await phoneInput.inputValue()).trim().length,
      (await emailInput.inputValue()).trim().length,
    );
    expect(displayNameLength).toBeGreaterThan(0);
    expect(contactLength).toBeGreaterThan(0);
    await expectNoHorizontalOverflow(page);

    if (expectBirthdayV2) {
      await page.goto("/birthdays");
      await expect(page.getByRole("heading", { level: 1, name: "生日祝福" })).toBeVisible();
      await expect(page.getByText(/新設定預設公開月、日；尚未設定的舊資料仍維持不公開/u)).toBeVisible();
      await expect(page.getByText("目前無法確認生日祝福權限，請稍後重新整理。", { exact: true })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    }

    if (expectBirthdayCollection) {
      await page.goto("/birthdays");
      const collectionLink = page.getByRole("link", { name: "生日祝福任務", exact: true });
      await expect(collectionLink).toHaveCount(1);
      await collectionLink.click();
      await expect(page).toHaveURL(/\/birthday-collection\?clubId=[0-9a-f-]{36}$/u);
      await expect(page.getByRole("heading", { level: 1, name: "生日祝福徵集" })).toBeVisible();
      await expect(page.getByText("目前無法確認生日祝福徵集權限，請稍後重新整理。", { exact: true })).toHaveCount(0);
      await expectNoHorizontalOverflow(page);
    }

    // role_shells_v2 tucks the logout button inside a collapsed "帳號選單"
    // disclosure (see member-smoke.e2e.mjs / role-shells.e2e.mjs);
    // LegacyAppShell exposes it directly. Open the disclosure first when
    // present so this test works under either shell.
    const accountMenuToggle = page.getByLabel("帳號選單");
    if (await accountMenuToggle.count()) {
      await accountMenuToggle.click();
    }
    await page.getByRole("button", { name: "登出" }).click();
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/u);
    await expect(page.getByRole("heading", { level: 1, name: "歡迎回來" })).toBeVisible();
  });
});
