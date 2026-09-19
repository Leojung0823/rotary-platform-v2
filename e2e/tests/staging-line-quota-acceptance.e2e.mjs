import { expect, test } from "@playwright/test";
import { isPublicHostname } from "../../src/lib/public-hostname.mjs";

const operatorEmail = process.env.STAGING_TEST_OPERATOR_EMAIL;
const operatorPassword = process.env.STAGING_TEST_OPERATOR_PASSWORD;
const memberEmail = process.env.STAGING_TEST_MEMBER_EMAIL;
const memberPassword = process.env.STAGING_TEST_MEMBER_PASSWORD;
const expectedClubName = process.env.STAGING_EXPECTED_CLUB_NAME;
const expectedSha = process.env.E2E_EXPECTED_SHA;
const baseURL = process.env.E2E_BASE_URL;

function requireStagingConfiguration() {
  if (!operatorEmail || !operatorPassword || !memberEmail || !memberPassword
    || !expectedClubName || !expectedSha || !baseURL) {
    throw new Error("Protected staging LINE quota acceptance configuration is incomplete.");
  }
  const parsed = new URL(baseURL);
  if (parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
    || !isPublicHostname(parsed.hostname)) {
    throw new Error("Staging LINE quota acceptance requires a public, credential-free HTTPS origin.");
  }
  if (!/^[a-f0-9]{40}$/u.test(expectedSha)) {
    throw new Error("E2E_EXPECTED_SHA must be an exact 40-character commit SHA.");
  }
}

async function login(page, email, password) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1, name: "歡迎回來" })).toBeVisible();
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

test.describe("受保護的 Hosted staging LINE 額度提示驗收", () => {
  test.skip(process.env.E2E_REMOTE !== "1", "Hosted staging acceptance only runs in protected remote mode.");

  test.beforeAll(() => {
    requireStagingConfiguration();
  });

  test("社務管理員看得到停止提示，一般社員不能看", async ({ page }) => {
    test.setTimeout(90_000);
    const healthResponse = await page.request.get("/api/health", {
      headers: { "cache-control": "no-cache" },
    });
    expect(healthResponse.status()).toBe(200);
    const health = await healthResponse.json();
    expect(health.status).toBe("ok");
    expect(health.environment).toBe("staging");
    expect(health.revision).toBe(expectedSha.slice(0, 12));
    expect(health.issues).toEqual([]);

    await login(page, operatorEmail, operatorPassword);
    await page.goto("/dashboard?mode=management");
    await expect(page.getByText(expectedClubName, { exact: true }).first()).toBeVisible();
    await page.getByTestId("management-card-members").click();
    await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]{36}\/members\?mode=management$/u);
    await page.getByRole("link", { name: "LINE OA", exact: true }).click();
    await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]{36}\/line-oa\?mode=management$/u);
    await expect(page.getByRole("heading", { name: "LINE Official Account" })).toBeVisible();
    await expect(page.getByText("LINE 推播已暫停：", { exact: true })).toBeVisible();
    await expect(page.getByText("已達 LINE 的推播頻率或方案額度上限，系統已停止後續批次。", { exact: false })).toBeVisible();
    await expect(page.getByText(/最近一次推播嘗試 700 位，已送達 500 位（1\/2 批）/u)).toBeVisible();

    const managementLineOaUrl = new URL(page.url());
    const memberContext = await page.context().browser().newContext({ baseURL });
    const memberPage = await memberContext.newPage();
    try {
      await login(memberPage, memberEmail, memberPassword);
      await memberPage.goto(`${managementLineOaUrl.pathname}${managementLineOaUrl.search}`);
      await expect(memberPage).toHaveURL(/\/access-denied(?:\?|$)/u);
      await expect(memberPage.getByText("LINE 推播已暫停：", { exact: true })).toHaveCount(0);
    } finally {
      await memberContext.close();
    }
  });
});
