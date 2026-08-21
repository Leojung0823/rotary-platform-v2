import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const memberEmail = "e2e-shell-ordinary@example.test";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for blessing privacy browser tests.");
}

async function openBlessingWall(page) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(memberEmail);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await page.goto(new URL("/blessings", baseURL).toString());
  await expect(page.getByRole("heading", { name: "祝福 IOU" })).toBeVisible();
}

test("the hide-amount choice is visible before an amount is typed", async ({ page }) => {
  await openBlessingWall(page);

  // The page tells the member they may hide the amount. If the control only
  // appeared once an unrelated field was filled, that promise would read as
  // broken -- which is exactly how it was reported.
  const choice = page.getByText("隱藏我的金額").first();
  await expect(choice).toBeVisible();

  const checkbox = page.locator('input[type="checkbox"]').first();
  await expect(checkbox).toBeDisabled();
  await expect(page.getByText("填入上方金額後可以選擇").first()).toBeVisible();
});

test("typing an amount enables the choice, and it defaults to hidden", async ({ page }) => {
  await openBlessingWall(page);

  await page.getByLabel("希望捐贈金額（選填）").first().fill("1000");

  const checkbox = page.locator('input[type="checkbox"]').first();
  await expect(checkbox).toBeEnabled();
  // Private by default: a member who does not think about it does not
  // accidentally publish an amount.
  await expect(checkbox).toBeChecked();
  await expect(page.getByText("其他社員只知道您有填捐款").first()).toBeVisible();

  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
});

test("clearing the amount disables the choice again", async ({ page }) => {
  await openBlessingWall(page);

  const amount = page.getByLabel("希望捐贈金額（選填）").first();
  await amount.fill("500");
  const checkbox = page.locator('input[type="checkbox"]').first();
  await expect(checkbox).toBeEnabled();

  await amount.fill("");
  await expect(checkbox).toBeDisabled();
  // Still visible, so the member can see the option exists at all times.
  await expect(page.getByText("隱藏我的金額").first()).toBeVisible();
});
