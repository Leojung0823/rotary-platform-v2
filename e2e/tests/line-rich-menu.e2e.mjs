import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const officerEmail = "e2e-shell-member-manager@example.test";
const richMenuWidth = 2500;
const richMenuHeight = 1686;

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for LINE Rich Menu browser tests.");
}

async function openLineOa(page) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(officerEmail);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);

  await page.goto(new URL("/dashboard?mode=member", baseURL).toString());
  await page.getByLabel("帳號選單").click();
  await page.getByRole("link", { name: "進入社務管理" }).click();
  await expect(page).toHaveURL(/\/members/u);
  await page.getByRole("link", { name: "LINE OA" }).click();
  await expect(page.getByRole("heading", { name: "LINE Official Account" })).toBeVisible();
}

// The server validates the PNG signature and IHDR dimensions before handing
// the bytes to the local mock provider. A tiny header is enough for this UI
// round-trip; the image parser tests cover malformed and oversized payloads.
function minimalPngWithDimensions(width, height) {
  const bytes = Buffer.alloc(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test("a club manager can publish and disable the local Rich Menu", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "line-oa-rich-menu-1440", "Rich Menu publish mutates the local OA fixture.");
  await openLineOa(page);

  const richMenu = page.locator("section.card").filter({
    has: page.getByRole("heading", { name: "LINE Rich Menu" }),
  });
  await expect(richMenu).toBeVisible();
  await expect(richMenu.getByText("尚未發布", { exact: true })).toBeVisible();

  await richMenu.locator('input[name="image"]').setInputFiles({
    name: "member-rich-menu.png",
    mimeType: "image/png",
    buffer: minimalPngWithDimensions(richMenuWidth, richMenuHeight),
  });
  await richMenu.getByRole("button", { name: "發布社員 Rich Menu" }).click();
  await expect(page.getByText("社員 Rich Menu 已發布給本社 LINE OA 好友。", { exact: true })).toBeVisible();
  await expect(page.getByText("已發布", { exact: true })).toBeVisible();
  await expect(richMenu.getByRole("button", { name: "停用社員 Rich Menu" })).toBeVisible();

  await richMenu.getByRole("button", { name: "停用社員 Rich Menu" }).click();
  await expect(page.getByText("社員 Rich Menu 已停用；LINE OA 仍可正常接收訊息。", { exact: true })).toBeVisible();
  await expect(richMenu.getByText("尚未發布", { exact: true })).toBeVisible();
});
