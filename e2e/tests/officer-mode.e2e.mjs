import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// A member of the club who also holds management roles there: a president.
const officerEmail = "e2e-shell-member-manager@example.test";
// Manages a club without belonging to it: an executive secretary.
const operatorEmail = "e2e-shell-management@example.test";

// A nav link's accessible name is whichever of its two labels the breakpoint
// leaves visible: the full label on desktop, the compact one on mobile.
const intoManagementName = /^(社團管理|管理)$/u;
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

test("an officer in member mode sees the events page a plain member sees", async ({ page }) => {
  await login(page, officerEmail);
  await page.goto(new URL("/events?mode=member", baseURL).toString());
  await expect(page.getByRole("heading", { name: "活動與報名" })).toBeVisible();

  // None of the management affordances belong in the member view.
  await expect(page.getByRole("heading", { name: "建立活動草稿" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "發布活動" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "取消活動" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "管理簽到" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(上傳圖片|更換圖片)$/u })).toHaveCount(0);

  // Drafts are a manager's business; a member never sees one.
  await expect(page.getByText("草稿", { exact: true })).toHaveCount(0);

  // But the officer is still a member, so they register and check in as one.
  await expect(page.getByRole("button", { name: "儲存報名狀態" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "本人簽到" }).first()).toBeVisible();
});

test("the same officer still gets the full management view in management mode", async ({ page }) => {
  await login(page, officerEmail);
  await page.goto(new URL("/events?mode=management", baseURL).toString());

  await expect(page.getByRole("heading", { name: "建立活動草稿" })).toBeVisible();
  await expect(page.getByRole("link", { name: "管理簽到" }).first()).toBeVisible();
});

test("an officer can leave management mode again", async ({ page }) => {
  await login(page, officerEmail);
  await page.goto(new URL("/dashboard?mode=member", baseURL).toString());

  // Into management...
  const intoManagement = page.getByRole("link", { name: intoManagementName });
  await expect(intoManagement).toBeVisible();
  await intoManagement.click();
  await expect(page).toHaveURL(/mode=management/u);

  // ...and back out, which is what used to be a one-way door.
  const backToMember = page.getByRole("link", { name: backToMemberName });
  await expect(backToMember).toBeVisible();
  await backToMember.click();
  await expect(page).toHaveURL(/mode=member/u);
  // Back in member mode the way in is offered again, which is the round trip.
  await expect(page.getByRole("link", { name: intoManagementName })).toBeVisible();
});

test("an operator with no membership is not offered a member mode to return to", async ({ page }) => {
  await login(page, operatorEmail);
  await page.goto(new URL("/dashboard", baseURL).toString());

  await expect(page.getByRole("link", { name: backToMemberName })).toHaveCount(0);
  // And their own management view is untouched by the member-view change.
  await page.goto(new URL("/events", baseURL).toString());
  await expect(page.getByRole("heading", { name: "建立活動草稿" })).toBeVisible();
});
