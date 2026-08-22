import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const officerEmail = "e2e-shell-member-manager@example.test";
const memberEmail = "e2e-shell-ordinary@example.test";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for board audience browser tests.");
}

async function openBoard(page, email) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await page.goto(new URL("/board", baseURL).toString());
  await expect(page.getByPlaceholder("輸入想和本社社員分享的內容……")).toBeVisible();
}

test("an ordinary member is offered no audience control at all", async ({ page }) => {
  await openBoard(page, memberEmail);

  // Addressing part of the club is a management act. A member sees the plain
  // composer they always had, not a disabled control they cannot use.
  await expect(page.getByText("發送對象")).toHaveCount(0);
  await expect(page.locator(".tag-option")).toHaveCount(0);
});

test("an officer can address a post to a tag, and says so before posting", async ({ page }) => {
  await openBoard(page, officerEmail);

  await expect(page.getByText("發送對象")).toBeVisible();
  await expect(page.getByText("未選擇時，這則留言全社都看得到。")).toBeVisible();

  await page.locator(".tag-option input").first().check();
  await expect(page.getByText("只有帶有所選標籤的社員看得到這則留言。")).toBeVisible();
});
