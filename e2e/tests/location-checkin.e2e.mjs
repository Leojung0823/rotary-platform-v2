import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const memberEmail = "e2e-shell-ordinary@example.test";
// Checking in mutates attendance for the whole run, so the flows that do it are
// pinned to one project; the rest only assert the panel renders responsively.
const mutatingProject = "location-checkin-1440";

// Matches the venue on the local fixture event (本機定位簽到例會).
const venue = { latitude: 25.033964, longitude: 121.564468 };
// ~100m north of the venue: inside the 200m radius.
const atVenue = { latitude: 25.034864, longitude: 121.564468 };
// ~5.5km north: comfortably outside it.
const farAway = { latitude: 25.083964, longitude: 121.564468 };

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for location check-in browser smoke tests.");
}

async function login(page) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(memberEmail);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

// Each scenario needs its own signed-in context, and one login plus navigation
// is most of a test's time budget on CI -- so they stay separate tests rather
// than sharing one that would run three logins back to back.
async function openCheckinPage(browser, viewport, geolocation) {
  const context = await browser.newContext(
    geolocation ? { viewport, geolocation } : { viewport, permissions: [] },
  );
  if (geolocation) await context.grantPermissions(["geolocation"], { origin: baseURL });
  const page = await context.newPage();
  await login(page);
  await page.goto(new URL("/events/checkin", baseURL).toString());
  await expect(page.getByRole("heading", { name: "用定位簽到" })).toBeVisible();
  return { context, page };
}

test("the location panel renders and explains a denied permission", async ({ browser }, testInfo) => {
  const viewport = testInfo.project.use.viewport ?? { width: 1440, height: 900 };
  const { context, page } = await openCheckinPage(browser, viewport, null);
  await expectNoHorizontalOverflow(page);

  const button = page.getByRole("button", { name: "用定位簽到" });
  if (await button.count()) {
    await button.click();
    await expect(page.getByText("定位權限未允許。", { exact: false })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  await context.close();
});

test("a member away from the venue is refused without being told the distance", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== mutatingProject, "One project drives the server-side geofence decision.");
  const viewport = testInfo.project.use.viewport ?? { width: 1440, height: 900 };
  const { context, page } = await openCheckinPage(browser, viewport, farAway);

  await page.getByRole("button", { name: "用定位簽到" }).click();
  await expect(page.getByText("您目前的位置不在活動場地範圍內。", { exact: false })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("公尺外");
  await context.close();
});

test("a member at the venue checks in, and repeating it stays idempotent", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== mutatingProject, "Checking in mutates attendance for the whole run.");
  const viewport = testInfo.project.use.viewport ?? { width: 1440, height: 900 };
  const { context, page } = await openCheckinPage(browser, viewport, atVenue);

  await page.getByRole("button", { name: "用定位簽到" }).click();
  await expect(page.getByText("簽到成功", { exact: false })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.reload();
  await expect(page.getByText("已簽到", { exact: true })).toBeVisible();
  await context.close();
});

test("the venue coordinate never reaches the member's browser", async ({ browser }, testInfo) => {
  const viewport = testInfo.project.use.viewport ?? { width: 1440, height: 900 };
  const { context, page } = await openCheckinPage(browser, viewport, atVenue);

  // The page tells the member which events are eligible, but the geofence
  // centre stays server-side so it cannot be read off and spoofed against.
  const markup = await page.content();
  expect(markup).not.toContain(String(venue.latitude));
  expect(markup).not.toContain(String(venue.longitude));
  await context.close();
});
