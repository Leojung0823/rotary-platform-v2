import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url)));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fixture = {};

function requireLocalFixtureAccess() {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Local Supabase fixture configuration is required.");
  const url = new URL(supabaseUrl);
  if (url.protocol !== "http:" || !new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname)) {
    throw new Error("Announcement browser fixtures refuse hosted Supabase.");
  }
}

async function serviceRequest(path, init = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Local announcement fixture request failed with HTTP ${response.status}.`);
  return response.status === 204 ? null : response.json();
}

async function insert(table, rows) {
  return serviceRequest(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify(rows) });
}

async function createAuthUser(email, password, name) {
  return serviceRequest("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
  });
}

async function setupFixtures() {
  requireLocalFixtureAccess();
  const suffix = randomUUID();
  fixture.password = `${randomUUID()}Aa1!`;
  fixture.managerEmail = `announcement-manager-${suffix}@example.test`;
  fixture.memberEmail = `announcement-member-${suffix}@example.test`;
  fixture.clubId = randomUUID();
  fixture.managerPersonId = randomUUID();
  fixture.memberPersonId = randomUUID();
  fixture.managerAccountId = randomUUID();
  fixture.memberAccountId = randomUUID();
  fixture.managerMembershipId = randomUUID();
  fixture.memberMembershipId = randomUUID();
  fixture.title = `本機公告 ${suffix.slice(0, 8)}`;
  const [managerUser, memberUser] = await Promise.all([
    createAuthUser(fixture.managerEmail, fixture.password, "公告測試秘書"),
    createAuthUser(fixture.memberEmail, fixture.password, "公告測試社員"),
  ]);
  await insert("people", [
    { id: fixture.managerPersonId, canonical_name: "公告測試秘書", primary_email: fixture.managerEmail },
    { id: fixture.memberPersonId, canonical_name: "公告測試社員", primary_email: fixture.memberEmail },
  ]);
  await insert("app_accounts", [
    { id: fixture.managerAccountId, auth_user_id: managerUser.id, person_id: fixture.managerPersonId, login_email: fixture.managerEmail, account_display_name: "公告測試秘書" },
    { id: fixture.memberAccountId, auth_user_id: memberUser.id, person_id: fixture.memberPersonId, login_email: fixture.memberEmail, account_display_name: "公告測試社員" },
  ]);
  await insert("clubs", {
    id: fixture.clubId,
    club_code: `V09-E2E-${suffix.slice(0, 6)}`,
    club_name: `公告瀏覽器測試社 ${suffix.slice(0, 6)}`,
    club_status: "active",
    activated_at: new Date().toISOString(),
    created_by_app_account_id: fixture.managerAccountId,
  });
  await insert("club_memberships", [
    { id: fixture.managerMembershipId, club_id: fixture.clubId, person_id: fixture.managerPersonId, membership_status: "active", joined_on: "2020-01-01", created_by_app_account_id: fixture.managerAccountId },
    { id: fixture.memberMembershipId, club_id: fixture.clubId, person_id: fixture.memberPersonId, membership_status: "active", joined_on: "2020-01-01", created_by_app_account_id: fixture.managerAccountId },
  ]);
  await insert("club_role_assignments", {
    id: randomUUID(), club_id: fixture.clubId, app_account_id: fixture.managerAccountId,
    role_key: "secretary", assignment_status: "active", granted_by_app_account_id: fixture.managerAccountId,
  });
}

async function login(page, email) {
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(fixture.password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/u);
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("V0.9 公告與通知本機瀏覽器流程", () => {
  test.beforeAll(setupFixtures);

  test("管理員發布公告；社員可讀取、標記已讀且無法進入管理頁", async ({ page, browser }) => {
    await login(page, fixture.managerEmail);
    await page.goto(`/announcements/manage/new?clubId=${fixture.clubId}`);
    await expect(page.getByRole("heading", { level: 1, name: "新增公告" })).toBeVisible();
    await page.getByLabel("標題").fill(fixture.title);
    await page.getByLabel("內容").fill("這是本機瀏覽器 smoke 的公告內容。");
    await page.getByRole("button", { name: "儲存草稿" }).click();
    await expect(page.getByText("草稿已建立。")).toBeVisible();
    await page.getByText("繼續發布", { exact: true }).click();
    await page.getByRole("button", { name: "確認立即發布" }).click();
    await expect(page.getByText("公告已發布並解析受眾。")).toBeVisible();
    await expect(page.getByText("受眾通知")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await login(memberPage, fixture.memberEmail);
    await memberPage.goto(`/announcements?clubId=${fixture.clubId}`);
    await expect(memberPage.getByText(fixture.title, { exact: true })).toBeVisible();
    await memberPage.getByRole("link", { name: "查看公告 →" }).click();
    await expect(memberPage.getByRole("heading", { level: 1, name: fixture.title })).toBeVisible();
    await memberPage.getByRole("button", { name: "標記已讀" }).click();
    await expect(memberPage.getByText("已標記為已讀。")).toBeVisible();
    await memberPage.goto("/notifications");
    await expect(memberPage.getByText(fixture.title, { exact: true })).toBeVisible();
    await memberPage.getByText("全部標記為已讀", { exact: true }).click();
    await memberPage.getByRole("button", { name: "確認全部已讀" }).click();
    await expect(memberPage.getByText("已更新已讀狀態。")).toBeVisible();
    await memberPage.goto("/announcements/manage");
    await expect(memberPage).toHaveURL(/\/access-denied\?reason=announcement_manage_required$/u);
    await expectNoHorizontalOverflow(memberPage);
    await memberContext.close();
  });
});
