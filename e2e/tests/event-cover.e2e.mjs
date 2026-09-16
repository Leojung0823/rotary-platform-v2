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
  // This one genuinely does a lot of real work: it generates an 11MB photo in
  // the page, decodes it, resizes it, uploads it to Storage, reloads and waits
  // for the signed link to paint. That fits the default budget locally but not
  // on a CI runner, and the point of the test is that the whole chain works.
  test.setTimeout(120_000);
  await login(page, managerEmail);
  await page.goto(new URL("/events?mode=management", baseURL).toString());
  await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]+\/events\?mode=management$/u);

  // The control reads "上傳圖片" for an event with no picture yet and "更換圖片"
  // for one that already has it. Both are valid starting states -- an earlier
  // run leaves a cover behind -- and the upload path under test is the same.
  const control = page.getByRole("button", { name: /^(上傳圖片|更換圖片)$/u }).first();
  await expect(control).toBeVisible();
  const bytes = await oversizedPhoto(page);
  await page.setInputFiles('input[type="file"]', {
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(bytes),
  });
  await expect(page.getByText("圖片已更新。").first()).toBeVisible({ timeout: 30_000 });

  await page.reload();
  // The poster is folded away on the management list so an officer can scan a
  // dozen events without scrolling past a dozen full-width images. It is still
  // there, and opening the fold is what an officer does to look at it.
  const fold = page.locator("details.cover-fold").first();
  await expect(fold).toBeAttached();
  await fold.locator("summary").click();

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

test("a cover a manager uploads is the cover a member sees", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "event-cover-1440", "One upload per run is enough.");
  test.setTimeout(90_000);
  // The upload test proves the picture comes back on the page it was uploaded
  // from. Nothing checked that it reaches the page members read -- which is
  // where Leo found it missing.
  //
  // It starts from the member page on purpose. Picking the first management
  // card instead chose whichever event sorted first, and that turned out to be
  // a targeted one the member was never addressed to, so the title being
  // looked for could not be there.
  await login(page, managerEmail);
  await page.goto(new URL("/events?mode=member", baseURL).toString());
  const memberCard = page.locator("article.card").first();
  await expect(memberCard).toBeVisible();
  const title = (await memberCard.locator("summary h2").first().innerText()).trim();

  // The same event, on the page an officer uploads from.
  await page.goto(new URL("/events?mode=management", baseURL).toString());
  await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]+\/events\?mode=management$/u);
  const managedCard = page.locator("article.card").filter({ hasText: title }).first();
  await expect(managedCard, `the member's own event is missing from management: ${title}`).toBeVisible();

  const control = managedCard.getByRole("button", { name: /^(上傳圖片|更換圖片)$/u });
  await expect(control).toBeVisible();
  // A small PNG: the resize is the other test's subject, this one is about
  // where the picture ends up.
  await managedCard.locator('input[type="file"]').setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(page.getByText("圖片已更新。").first()).toBeVisible({ timeout: 30_000 });

  // Back to the member view, where it has to appear.
  await page.goto(new URL("/events?mode=member", baseURL).toString());
  const card = page.locator("article.card").filter({ hasText: title }).first();
  await expect(card).toBeVisible();
  const cover = card.locator("img.event-cover").first();
  await expect(cover, "the cover did not reach the member view").toBeAttached();
  await cover.scrollIntoViewIfNeeded();
  await expect.poll(
    () => cover.evaluate((image) => image.naturalWidth),
    { timeout: 15_000 },
  ).toBeGreaterThan(0);
});

test("an ordinary member sees the cover but is offered no way to change it", async ({ page }) => {
  await login(page, memberEmail);
  await page.goto(new URL("/events", baseURL).toString());

  await expect(page.getByRole("heading", { name: "活動" }).first()).toBeVisible();

  // The cover stays outside the card's disclosure, so it is visible without
  // opening anything. Asserting a cover exists would depend on whether this
  // run's fixtures happen to have one -- the claim that belongs to this change
  // is where a cover sits, not that there is one.
  const cards = page.locator("article.card");
  await expect(cards.first()).toBeVisible();
  const coversInsideFold = await page.locator("details.event-fold img.event-cover").count();
  expect(coversInsideFold, "a cover is hidden behind the disclosure").toBe(0);
  const covers = await page.locator("img.event-cover").count();
  if (covers > 0) await expect(page.locator("img.event-cover").first()).toBeVisible();

  await expect(page.getByRole("button", { name: "上傳圖片" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "更換圖片" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "移除圖片" })).toHaveCount(0);
});
