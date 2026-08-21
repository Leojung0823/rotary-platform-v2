import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const memberEmail = "e2e-shell-ordinary@example.test";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for interaction hub browser tests.");
}

async function login(page) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(memberEmail);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

test("the interaction tab opens a hub that reaches all three social features", async ({ page }) => {
  await login(page);

  const bar = page.getByRole("navigation", { name: "主要導覽" });
  await bar.getByRole("link", { name: "互動" }).click();
  await expect(page).toHaveURL(/\/interact/u);
  await expect(page.getByRole("heading", { name: "社內互動" })).toBeVisible();

  // Every card must actually open its page rather than 404, which is the whole
  // reason the hub exists: these three had no entry point at all before.
  for (const [name, pattern] of [
    ["留言板", /\/board/u],
    ["生日祝福", /\/birthdays/u],
    ["祝福 IOU", /\/blessings/u],
  ]) {
    await page.goto(new URL("/interact", baseURL).toString());
    const card = page.getByRole("link", { name: new RegExp(name, "u") });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(pattern);
    // A notFound() would render the 404 page instead of the shell.
    await expect(page.getByRole("navigation", { name: "主要導覽" })).toBeVisible();
  }
});

test("navigation icons render as drawn artwork, not font glyphs", async ({ page }) => {
  await login(page);

  const icons = page.getByRole("navigation", { name: "主要導覽" }).locator("svg");
  // The shell streams in behind a Suspense boundary, and count() -- unlike an
  // expect() -- does not wait for it, so anything counted before this assertion
  // is counted on an empty page.
  await expect(icons.first()).toBeVisible();
  const count = await icons.count();
  expect(count).toBeGreaterThan(3);

  // Every icon must occupy real space; an svg that failed to draw collapses.
  for (let index = 0; index < count; index += 1) {
    const box = await icons.nth(index).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(8);
    expect(box?.height ?? 0).toBeGreaterThan(8);
  }

  // They follow the link colour rather than carrying one of their own, which
  // is what keeps the per-mode accent and the current-tab state working.
  const stroke = await icons.first().evaluate((node) => getComputedStyle(node).stroke);
  const linkColor = await icons.first().evaluate(
    (node) => getComputedStyle(node.closest("a")).color,
  );
  expect(stroke).toBe(linkColor);
});
