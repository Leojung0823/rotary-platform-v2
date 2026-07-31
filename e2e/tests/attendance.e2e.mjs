import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const fixture = {};

function requireLocalFixtureAccess() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for local attendance browser tests.");
  }
  const url = new URL(supabaseUrl);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    throw new Error("Attendance browser fixtures are local-only and refuse hosted Supabase URLs.");
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
  if (!response.ok) throw new Error(`Local fixture request failed with HTTP ${response.status}.`);
  return response.status === 204 ? null : response.json();
}

async function createAuthUser(email, password, name) {
  return serviceRequest("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
  });
}

async function insert(table, rows) {
  return serviceRequest(`/rest/v1/${table}`, { method: "POST", body: JSON.stringify(rows) });
}

function pastIso(days, hours = 0) {
  return new Date(Date.now() - days * 86_400_000 + hours * 3_600_000).toISOString();
}

async function setupFixtures() {
  requireLocalFixtureAccess();
  const suffix = randomUUID();
  fixture.secretaryEmail = `attendance-secretary-${suffix}@example.test`;
  fixture.memberEmail = `attendance-member-${suffix}@example.test`;
  fixture.password = `${randomUUID()}Aa1!`;
  fixture.clubA = randomUUID();
  fixture.clubB = randomUUID();
  fixture.managerPerson = randomUUID();
  fixture.memberPerson = randomUUID();
  fixture.formulaPerson = randomUUID();
  fixture.managerAccount = randomUUID();
  fixture.memberAccount = randomUUID();
  fixture.managerMembershipA = randomUUID();
  fixture.managerMembershipB = randomUUID();
  fixture.memberMembershipA = randomUUID();
  fixture.memberMembershipB = randomUUID();
  fixture.formulaMembership = randomUUID();
  fixture.events = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  fixture.crossEvent = randomUUID();
  const [secretaryUser, memberUser] = await Promise.all([
    createAuthUser(fixture.secretaryEmail, fixture.password, "瀏覽器測試秘書"),
    createAuthUser(fixture.memberEmail, fixture.password, "瀏覽器測試社員"),
  ]);

  await insert("people", [
    { id: fixture.managerPerson, canonical_name: "瀏覽器測試秘書", primary_email: fixture.secretaryEmail },
    { id: fixture.memberPerson, canonical_name: "瀏覽器測試社員", primary_email: fixture.memberEmail },
    { id: fixture.formulaPerson, canonical_name: "=2+2", primary_email: null },
  ]);
  await insert("app_accounts", [
    { id: fixture.managerAccount, auth_user_id: secretaryUser.id, person_id: fixture.managerPerson, login_email: fixture.secretaryEmail, account_display_name: "瀏覽器測試秘書" },
    { id: fixture.memberAccount, auth_user_id: memberUser.id, person_id: fixture.memberPerson, login_email: fixture.memberEmail, account_display_name: "瀏覽器測試社員" },
  ]);
  await insert("clubs", [
    { id: fixture.clubA, club_code: `E2E-A-${suffix.slice(0, 6)}`, club_name: `瀏覽器出席甲社 ${suffix.slice(0, 6)}`, club_status: "active", activated_at: new Date().toISOString(), created_by_app_account_id: fixture.managerAccount },
    { id: fixture.clubB, club_code: `E2E-B-${suffix.slice(0, 6)}`, club_name: `瀏覽器出席乙社 ${suffix.slice(0, 6)}`, club_status: "active", activated_at: new Date().toISOString(), created_by_app_account_id: fixture.managerAccount },
  ]);
  await insert("club_memberships", [
    { id: fixture.managerMembershipA, club_id: fixture.clubA, person_id: fixture.managerPerson, membership_status: "active", joined_on: "2020-01-01", created_by_app_account_id: fixture.managerAccount },
    { id: fixture.managerMembershipB, club_id: fixture.clubB, person_id: fixture.managerPerson, membership_status: "active", joined_on: "2020-01-01", created_by_app_account_id: fixture.managerAccount },
    { id: fixture.memberMembershipA, club_id: fixture.clubA, person_id: fixture.memberPerson, membership_status: "active", joined_on: "2020-01-01", created_by_app_account_id: fixture.managerAccount },
    { id: fixture.memberMembershipB, club_id: fixture.clubB, person_id: fixture.memberPerson, membership_status: "active", joined_on: "2020-01-01", created_by_app_account_id: fixture.managerAccount },
    { id: fixture.formulaMembership, club_id: fixture.clubA, person_id: fixture.formulaPerson, membership_status: "active", joined_on: "2020-01-01", created_by_app_account_id: fixture.managerAccount },
  ]);
  await insert("club_role_assignments", [
    { id: randomUUID(), club_id: fixture.clubA, app_account_id: fixture.managerAccount, role_key: "secretary", assignment_status: "active", granted_by_app_account_id: fixture.managerAccount },
    { id: randomUUID(), club_id: fixture.clubB, app_account_id: fixture.managerAccount, role_key: "secretary", assignment_status: "active", granted_by_app_account_id: fixture.managerAccount },
  ]);

  const eventTitles = ["瀏覽器請假例會", "瀏覽器公假例會", "瀏覽器補出席例會", "瀏覽器免計例會"];
  await insert("club_events", [
    ...fixture.events.map((id, index) => ({
      id,
      club_id: fixture.clubA,
      event_type: "regular_meeting",
      title: eventTitles[index],
      starts_at: pastIso(12 - index * 2),
      ends_at: pastIso(12 - index * 2, 2),
      registration_deadline: pastIso(13 - index * 2),
      counts_for_attendance: true,
      event_status: "completed",
      published_at: pastIso(20),
      created_by_app_account_id: fixture.managerAccount,
      updated_by_app_account_id: fixture.managerAccount,
    })),
    {
      id: fixture.crossEvent,
      club_id: fixture.clubB,
      event_type: "regular_meeting",
      title: "瀏覽器乙社例會",
      starts_at: pastIso(4),
      ends_at: pastIso(4, 2),
      registration_deadline: pastIso(5),
      counts_for_attendance: true,
      event_status: "completed",
      published_at: pastIso(10),
      created_by_app_account_id: fixture.managerAccount,
      updated_by_app_account_id: fixture.managerAccount,
    },
  ]);
  await insert("event_attendances", {
    id: randomUUID(),
    club_id: fixture.clubA,
    event_id: fixture.events[0],
    membership_id: fixture.memberMembershipA,
    attendance_status: "active",
    checkin_method: "manual",
    checked_in_at: pastIso(12),
    checked_in_by_app_account_id: fixture.managerAccount,
    checkin_note: "本機瀏覽器合成測試",
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

test.describe("V0.8 出席管理本機瀏覽器流程", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeAll(setupFixtures);

  test("社員只看本人紀錄並正確切換多社", async ({ page }) => {
    await login(page, fixture.memberEmail);
    await page.goto(`/attendance?clubId=${fixture.clubA}`);
    await expect(page.getByRole("heading", { level: 1, name: "我的出席" })).toBeVisible();
    await expect(page.getByText("瀏覽器請假例會", { exact: true })).toBeVisible();
    await expect(page.getByText("=2+2", { exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.goto(`/attendance?clubId=${fixture.clubB}`);
    await expect(page.getByText("瀏覽器乙社例會", { exact: true })).toBeVisible();
    await expect(page.getByText("瀏覽器請假例會", { exact: true })).toHaveCount(0);

    await page.goto(`/attendance/manage?clubId=${fixture.clubA}&eventId=${fixture.events[0]}`);
    await expect(page).toHaveURL(/\/access-denied\?reason=attendance_manage_required$/u);
  });

  test("秘書查看名冊並設定請假、公假、補出席與免計", async ({ page }) => {
    await login(page, fixture.secretaryEmail);
    const adjustments = [
      [fixture.events[0], "leave", "社員事前請假"],
      [fixture.events[1], "official_leave", "代表本社公務出席"],
      [fixture.events[2], "makeup", "跨社補出席證明"],
      [fixture.events[3], "exempt", "本場免計核准"],
    ];
    for (const [eventId, type, reason] of adjustments) {
      await page.goto(`/attendance/manage?clubId=${fixture.clubA}&eventId=${eventId}`);
      await expect(page.getByRole("heading", { level: 1, name: "出席管理" })).toBeVisible();
      const member = page.locator("article.attendance-member").filter({ hasText: "=2+2" });
      await expect(member).toBeVisible();
      await member.getByLabel("調整類型").selectOption(type);
      await member.getByLabel("異動原因").fill(reason);
      await member.getByRole("button", { name: "建立調整" }).click();
      await expect(page.getByText("人工調整已建立，原始簽到紀錄保持不變。")).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
  });

  test("撤銷 adjustment 保留歷史且 CSV 中和公式", async ({ page }) => {
    await login(page, fixture.secretaryEmail);
    await page.goto(`/attendance/manage?clubId=${fixture.clubA}&eventId=${fixture.events[0]}`);
    const member = page.locator("article.attendance-member").filter({ hasText: "=2+2" });
    await member.getByLabel("撤銷原因").fill("社員撤回請假");
    await member.getByRole("button", { name: "撤銷調整" }).click();
    await expect(page.getByText("人工調整已撤銷，完整歷史仍保留。")).toBeVisible();
    await expect(page.getByText("社員撤回請假", { exact: true })).toBeVisible();

    const download = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "匯出安全 CSV" }).click(),
    ]).then(([item]) => item);
    const stream = await download.createReadStream();
    let csv = "";
    for await (const chunk of stream) csv += chunk.toString("utf8");
    expect(csv).toContain("\"'=2+2\"");
    expect(csv).not.toContain("auth_user_id");
    expect(csv).not.toContain("person_id");
  });
});
