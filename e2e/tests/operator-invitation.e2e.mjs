import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const mailpitUrl = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";

function requireCredentials() {
  if (!adminEmail || !adminPassword) {
    throw new Error("E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required.");
  }
}

async function login(page, email, password) {
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function findInvitationLink(recipient) {
  const listingResponse = await fetch(`${mailpitUrl}/api/v1/messages`);
  if (!listingResponse.ok) return null;
  const listing = await listingResponse.json();
  const summary = listing.messages?.find((message) =>
    message.To?.some((address) => address.Address?.toLowerCase() === recipient.toLowerCase()),
  );
  if (!summary) return null;

  const messageResponse = await fetch(`${mailpitUrl}/api/v1/message/${summary.ID}`);
  if (!messageResponse.ok) return null;
  const message = await messageResponse.json();
  const html = String(message.HTML ?? "").replaceAll("&amp;", "&");
  const match = html.match(/href="([^"]*token_hash=[^"]+)"/u);
  return match?.[1] ?? null;
}

test("管理員建立扶輪社後，受邀執行秘書可從 Email 設定密碼並登入", async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "完整 Mailpit 邀請閉環只需在桌面專案執行一次。");
  requireCredentials();

  const suffix = randomUUID().slice(0, 8);
  const clubCode = `E2E-${suffix}`.toUpperCase();
  const clubName = `E2E 邀請驗證扶輪社 ${suffix}`;
  const operatorName = `E2E 執行秘書 ${suffix}`;
  const operatorEmail = `e2e-operator-${suffix}@example.test`;
  const operatorPassword = `Rotary-E2E-${suffix}-Pass!`;

  await login(page, adminEmail, adminPassword);
  await page.goto("/platform/clubs/new");
  await expect(page.getByRole("heading", { level: 1, name: "建立扶輪社" })).toBeVisible();
  await page.getByLabel("扶輪社代碼").fill(clubCode);
  await page.getByLabel("扶輪社名稱").fill(clubName);
  await page.getByLabel("首位執行秘書姓名").fill(operatorName);
  await page.getByLabel("首位執行秘書 Email").fill(operatorEmail);
  await page.getByRole("button", { name: "建立扶輪社並寄出邀請" }).click();
  await expect(page).toHaveURL(/\/platform\/clubs\/[0-9a-f-]+\?success=club_created$/u);
  await expect(page.getByRole("heading", { level: 1, name: clubName })).toBeVisible();

  let inviteHref = null;
  await expect.poll(async () => {
    inviteHref = await findInvitationLink(operatorEmail);
    return Boolean(inviteHref);
  }, { timeout: 20_000, intervals: [250, 500, 1_000] }).toBe(true);

  const invitationUrl = new URL(inviteHref);
  expect(invitationUrl.pathname).toBe("/auth/confirm");
  expect(invitationUrl.searchParams.get("token_hash")).toBeTruthy();
  expect(invitationUrl.searchParams.get("type")).toBe("invite");

  const operatorContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const operatorPage = await operatorContext.newPage();
  await operatorPage.goto(invitationUrl.toString());
  await expect(operatorPage).toHaveURL(/\/invite\/accept$/u);
  await expect(operatorPage.getByRole("heading", { level: 1, name: "接受扶輪社管理邀請" })).toBeVisible();
  await expect(operatorPage.getByText(clubName, { exact: true })).toBeVisible();

  await operatorPage.getByLabel("設定登入密碼").fill(operatorPassword);
  await operatorPage.getByLabel("再次輸入密碼").fill(operatorPassword);
  await operatorPage.getByRole("button", { name: "設定密碼並接受所選邀請" }).click();
  await expect(operatorPage).toHaveURL(/\/clubs\/[0-9a-f-]+\/operators\?success=accepted$/u);
  await expect(operatorPage.getByText("邀請已接受，扶輪社管理權限已啟用。", { exact: true })).toBeVisible();
  await expect(operatorPage.getByText(operatorEmail, { exact: true })).toBeVisible();

  await operatorPage.getByRole("button", { name: "登出" }).click();
  await expect(operatorPage).toHaveURL(/\/login$/u);
  await login(operatorPage, operatorEmail, operatorPassword);
  await expect(operatorPage.getByText(clubName, { exact: true })).toBeVisible();

  await operatorContext.close();
});
