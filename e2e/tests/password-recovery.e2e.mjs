import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const mailpitUrl = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324";
const localEnvPath = fileURLToPath(new URL("../../.env.local", import.meta.url));

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

async function readLocalSupabaseAdmin() {
  const contents = await readFile(localEnvPath, "utf8");
  const values = new Map();
  for (const line of contents.split(/\r?\n/u)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    values.set(line.slice(0, separator), line.slice(separator + 1));
  }

  const url = values.get("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = values.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
    throw new Error("Local Supabase admin configuration is unavailable or non-local.");
  }
  return { url, serviceKey };
}

async function restorePassword(email, password) {
  const { url, serviceKey } = await readLocalSupabaseAdmin();
  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };
  const listing = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`, { headers });
  if (!listing.ok) throw new Error("Could not list local Auth users for password restoration.");
  const payload = await listing.json();
  const user = payload.users?.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
  if (!user?.id) throw new Error("Could not find the local administrator for password restoration.");

  const restored = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ password }),
  });
  if (!restored.ok) throw new Error("Could not restore the local administrator password.");
}

async function listRecoveryMessages(recipient) {
  const listingResponse = await fetch(`${mailpitUrl}/api/v1/messages`);
  if (!listingResponse.ok) return [];
  const listing = await listingResponse.json();
  return listing.messages?.filter((message) =>
    message.To?.some((address) => address.Address?.toLowerCase() === recipient.toLowerCase()),
  ) ?? [];
}

async function findRecoveryLink(recipient, excludedMessageIds = new Set()) {
  const messages = (await listRecoveryMessages(recipient))
    .filter((message) => !excludedMessageIds.has(message.ID))
    .sort((left, right) => Date.parse(String(right.Created ?? "")) - Date.parse(String(left.Created ?? "")));

  for (const summary of messages) {
    const messageResponse = await fetch(`${mailpitUrl}/api/v1/message/${summary.ID}`);
    if (!messageResponse.ok) continue;
    const message = await messageResponse.json();
    const source = `${String(message.HTML ?? "")}\n${String(message.Text ?? "")}`.replaceAll("&amp;", "&");
    const candidates = [
      ...source.matchAll(/href="([^"]+)"/gu),
      ...source.matchAll(/https?:\/\/[^\s<>"']+/gu),
    ].map((match) => match[1] ?? match[0]);

    for (const candidate of candidates) {
      try {
        const url = new URL(candidate);
        if (url.searchParams.get("type") === "recovery" || candidate.includes("type=recovery")) {
          return candidate;
        }
      } catch {
        // Ignore non-URL fragments from the email body.
      }
    }
  }
  return null;
}

test("已啟用帳號可透過 Mailpit recovery link 重設密碼並重新登入", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "完整密碼 recovery 閉環只需在桌面專案執行一次。");
  requireCredentials();

  const newPassword = `Rotary-Recovery-${Date.now()}-Pass!`;
  let passwordChanged = false;

  try {
    const previousRecoveryMessages = await listRecoveryMessages(adminEmail);
    const previousRecoveryMessageIds = new Set(previousRecoveryMessages.map((message) => message.ID));

    await page.goto("/forgot-password");
    await page.getByLabel("電子郵件").fill(adminEmail);
    await page.getByRole("button", { name: "寄送重設連結" }).click();
    await expect(page).toHaveURL(/\/forgot-password\?success=sent$/u);
    await expect(page.getByText("若這個 Email 有可使用的帳號，重設信已寄出。請查看信箱；本機開發可至 Mailpit 檢視。", { exact: true })).toBeVisible();

    let recoveryHref = null;
    await expect.poll(async () => {
      recoveryHref = await findRecoveryLink(adminEmail, previousRecoveryMessageIds);
      return Boolean(recoveryHref);
    }, { timeout: 20_000, intervals: [250, 500, 1_000] }).toBe(true);
    if (!recoveryHref) throw new Error("Mailpit recovery link was not found.");
    expect(recoveryHref).not.toContain("access_token=");

    // A mail-security scanner follows the GET in an isolated browser, but
    // never presses the app-owned confirmation button. That prefetch must not
    // consume the member's one-time recovery credential.
    const scannerContext = await browser.newContext();
    const scannerPage = await scannerContext.newPage();
    await scannerPage.goto(recoveryHref);
    await expect(scannerPage).toHaveURL(/\/auth\/recovery\/confirm/u);
    await expect(scannerPage.getByRole("heading", { level: 1, name: "確認重設密碼" })).toBeVisible();
    await scannerContext.close();

    await page.goto(recoveryHref);
    await expect(page).toHaveURL(/\/auth\/recovery\/confirm/u);
    await page.getByRole("button", { name: "確認是我本人，繼續重設" }).click();
    await expect(page).toHaveURL(/\/reset-password$/u);
    await expect(page.getByRole("heading", { level: 1, name: "設定新密碼" })).toBeVisible();
    await page.getByLabel("新密碼", { exact: true }).fill(newPassword);
    await page.getByLabel("再次輸入新密碼", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "更新密碼並登出" }).click();
    passwordChanged = true;

    await expect(page).toHaveURL(/\/login\?success=password_updated$/u);
    await expect(page.getByText("密碼已更新，請使用新密碼登入。", { exact: true })).toBeVisible();
    await login(page, adminEmail, newPassword);
    await page.getByLabel("帳號選單").click();
    await page.getByRole("button", { name: "登出" }).click();
    await expect(page).toHaveURL(/\/login$/u);
  } finally {
    await restorePassword(adminEmail, adminPassword);
  }

  expect(passwordChanged).toBe(true);
  await login(page, adminEmail, adminPassword);
  await page.getByLabel("帳號選單").click();
  await page.getByRole("button", { name: "登出" }).click();
  await expect(page).toHaveURL(/\/login$/u);
});
