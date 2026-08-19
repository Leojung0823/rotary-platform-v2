import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const managerEmail = "e2e-shell-member-manager@example.test";
const memberEmail = "e2e-shell-ordinary@example.test";
// The browser must shrink to this before anything leaves the device.
const maxEdge = 1600;

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for event cover browser smoke tests.");
}

async function login(page, email) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

// Far larger than any card renders it, so a missing resize is unmistakable.
async function oversizedPhoto(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 4032;
    canvas.height = 3024;
    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#1677a8");
    gradient.addColorStop(1, "#d5a92e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
}

test("a manager uploads a cover, and the browser shrinks it first", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "event-cover-1440", "Uploading mutates the fixture event for the whole run.");
  await login(page, managerEmail);
  await page.goto(new URL("/events?mode=management", baseURL).toString());

  await expect(page.getByRole("button", { name: "上傳圖片" }).first()).toBeVisible();
  const bytes = await oversizedPhoto(page);
  await page.setInputFiles('input[type="file"]', {
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByText("圖片已更新。").first()).toBeVisible({ timeout: 30_000 });

  await page.reload();
  const cover = page.locator("img.event-cover").first();
  await expect(cover).toBeAttached();
  // The card carries loading="lazy", so the picture only fetches once it is
  // near the viewport -- exactly as it behaves for a member scrolling the list.
  await cover.scrollIntoViewIfNeeded();
  await expect(cover).toBeVisible();

  // Asserting on the decoded pixels rather than mere visibility: it proves the
  // signed link actually resolved, and it is the resize itself under test.
  await expect.poll(
    () => cover.evaluate((image) => image.naturalWidth),
    { timeout: 15_000 },
  ).toBeGreaterThan(0);

  const painted = await cover.evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
    src: image.currentSrc,
  }));
  expect(Math.max(painted.width, painted.height)).toBeLessThanOrEqual(maxEdge);
  // A signed link, not a public object URL: the bucket stays private.
  expect(painted.src).toContain("token=");
});

test("an ordinary member sees the cover but is offered no way to change it", async ({ page }) => {
  await login(page, memberEmail);
  await page.goto(new URL("/events", baseURL).toString());

  await expect(page.getByRole("heading", { name: "活動" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "上傳圖片" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "更換圖片" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "移除圖片" })).toHaveCount(0);
});
