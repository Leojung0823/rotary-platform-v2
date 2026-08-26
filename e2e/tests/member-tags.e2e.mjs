import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// A member of the club who also manages it.
const officerEmail = "e2e-shell-member-manager@example.test";
const memberEmail = "e2e-shell-ordinary@example.test";
const tagName = `瀏覽器測試標籤 ${Date.now()}`;

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for member tag browser tests.");
}

async function login(page, email) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function openMembers(page) {
  await login(page, officerEmail);
  await page.goto(new URL("/dashboard?mode=member", baseURL).toString());
  // The account menu's management link already points at the officer's own
  // club roster, so the club id does not have to be known here.
  await page.getByLabel("帳號選單").click();
  await page.getByRole("link", { name: "進入社務管理" }).click();
  await expect(page).toHaveURL(/\/members/u);
  await expect(page.getByRole("heading", { name: "社員標籤" })).toBeVisible();
}

test("an officer creates a tag, applies it to a member, and archives it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "member-tags-1440", "Creating tags mutates shared fixture data.");
  await openMembers(page);

  await page.getByLabel("標籤名稱").fill(tagName);
  await page.getByLabel("說明（選填）").fill("由瀏覽器測試建立");
  await page.getByRole("button", { name: "建立標籤" }).click();
  await expect(page).toHaveURL(/\/members\?success=tag_created$/u);
  await expect(page.getByText("標籤已建立。")).toBeVisible();

  const row = page.locator("tr").filter({ hasText: tagName });
  await expect(row).toBeVisible();
  // A brand new tag carries nobody yet.
  await expect(row.locator("td").nth(2)).toHaveText("0");

  // The same name again is refused rather than creating a second tag.
  await page.getByLabel("標籤名稱").fill(tagName);
  await page.getByRole("button", { name: "建立標籤" }).click();
  await expect(page).toHaveURL(/\/members\?error=tag_exists$/u);
  await expect(page.getByText("同名標籤已存在。")).toBeVisible();

  // Apply it to a member.
  await page.getByRole("link", { name: "管理 →" }).first().click();
  await expect(page.getByRole("heading", { name: "標籤" })).toBeVisible();
  const pill = page.locator(".tag-option").filter({ hasText: tagName });
  await expect(pill).toBeVisible();
  await pill.locator("input").check();
  await page.getByRole("button", { name: "儲存標籤" }).click();
  await expect(page.getByText("社員標籤已更新。")).toBeVisible();
  // The choice survives the round trip rather than only looking applied.
  await expect(page.locator(".tag-option").filter({ hasText: tagName }).locator("input")).toBeChecked();

  // The count on the tag list reflects it.
  await page.goto(new URL(page.url().replace(/\/members\/[^/?]+.*/u, "/members"), baseURL).toString());
  await expect(page.locator("tr").filter({ hasText: tagName }).locator("td").nth(2)).toHaveText("1");

  // Archiving removes it from the list without touching what it was used for.
  await page.locator("tr").filter({ hasText: tagName }).getByRole("button", { name: "封存" }).click();
  await expect(page.getByText("標籤已封存")).toBeVisible();
  await expect(page.locator("tr").filter({ hasText: tagName })).toHaveCount(0);
});

test("a plain member cannot reach the tag controls", async ({ page }) => {
  await login(page, memberEmail);
  // The members page belongs to management; a plain member has no club to
  // manage and must not be offered tag editing anywhere.
  await page.goto(new URL("/dashboard?mode=member", baseURL).toString());
  await expect(page.getByRole("heading", { name: "社員標籤" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "建立標籤" })).toHaveCount(0);
});
