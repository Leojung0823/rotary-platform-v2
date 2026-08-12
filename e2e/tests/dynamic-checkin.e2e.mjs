import { expect, test } from "@playwright/test";

const email = "e2e-shell-member-manager@example.test";
const password = process.env.E2E_ROLE_PASSWORD;
const clubId = "a1000000-0000-4000-8000-000000000001";
const eventId = "a1000000-0000-4000-8000-000000000104";

async function login(page) {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for dynamic QR browser smoke tests.");
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard/u);
  await page.goto(`/events/${eventId}/checkin?clubId=${clubId}`);
  await expect(page.getByRole("heading", { name: "本機動態 QR 管理例會" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

test("manager dynamic QR flow is responsive, hides raw credential input, rotates, and keeps manual recovery state", async ({ page }, testInfo) => {
  test.setTimeout(45_000);
  await login(page);
  const open = page.getByRole("button", { name: "開啟動態簽到 QR" });
  if (await open.isVisible()) await open.click();
  else await page.getByRole("button", { name: "顯示目前動態 QR" }).click();
  await expect(page.getByRole("heading", { name: "可簽到" })).toBeVisible();
  await expect(page.locator(".dynamic-qr-panel img")).toBeVisible();
  await expect(page.locator('textarea[name="token"]')).toHaveCount(0);
  await expect(page.locator('textarea[aria-label="一次性簽到 token"]')).toHaveCount(0);
  const firstSource = await page.locator(".dynamic-qr-panel img").getAttribute("src");
  await page.getByRole("button", { name: "更新 QR" }).click();
  await expect.poll(() => page.locator(".dynamic-qr-panel img").getAttribute("src")).not.toBe(firstSource);

  const manualReason = page.getByLabel("補登原因");
  await manualReason.fill("現場設備測試");
  await page.getByRole("button", { name: "人工補登" }).click();
  await expect(page.getByText("請填寫完整且有效的資料。")).toBeVisible();
  await expect(manualReason).toHaveValue("現場設備測試");
  await expect(manualReason).toHaveAttribute("aria-invalid", "true");
  await expectNoHorizontalOverflow(page);

  if (testInfo.project.name === "dynamic-checkin-1440") {
    await expect(page.getByRole("button", { name: "立即更換 QR" })).toBeVisible();
  }
  if (testInfo.project.name === "dynamic-checkin-768") {
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await expect(page.getByRole("button", { name: "關閉簽到" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
