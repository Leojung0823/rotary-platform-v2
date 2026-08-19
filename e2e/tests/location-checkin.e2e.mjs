import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const memberEmail = "e2e-shell-ordinary@example.test";
// Checking in mutates attendance for the whole run, so the flow that does it
// is pinned to one project; the rest only assert the panel renders responsively.
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

async function login(page, email) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
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

async function locatedContext(browser, viewport, geolocation) {
  const context = await browser.newContext({ viewport, geolocation });
  await context.grantPermissions(["geolocation"], { origin: baseURL });
  return context;
}

test("location check-in accepts a member at the venue and refuses one who is not", async ({ browser }, testInfo) => {
  requireCredentials();
  const viewport = testInfo.project.use.viewport ?? { width: 1440, height: 900 };

  // Denied permission must degrade to an explanation, never a silent failure.
  const deniedContext = await browser.newContext({ viewport, permissions: [] });
  const deniedPage = await deniedContext.newPage();
  await login(deniedPage, memberEmail);
  await deniedPage.goto(new URL("/events/checkin", baseURL).toString());
  await expect(deniedPage.getByRole("heading", { name: "用定位簽到" })).toBeVisible();
  await expectNoHorizontalOverflow(deniedPage);

  const deniedButton = deniedPage.getByRole("button", { name: "用定位簽到" });
  if (await deniedButton.count()) {
    await deniedButton.click();
    await expect(deniedPage.getByText("定位權限未允許。", { exact: false })).toBeVisible();
    await expectNoHorizontalOverflow(deniedPage);
  }
  await deniedContext.close();

  if (testInfo.project.name !== mutatingProject) return;

  // Outside the radius: refused, and the refusal must not disclose a distance.
  const farContext = await locatedContext(browser, viewport, farAway);
  const farPage = await farContext.newPage();
  await login(farPage, memberEmail);
  await farPage.goto(new URL("/events/checkin", baseURL).toString());
  await farPage.getByRole("button", { name: "用定位簽到" }).click();
  await expect(farPage.getByText("您目前的位置不在活動場地範圍內。", { exact: false })).toBeVisible();
  await expect(farPage.locator("body")).not.toContainText("公尺外");
  await farContext.close();

  // At the venue: check-in succeeds, and repeating it stays idempotent.
  const atVenueContext = await locatedContext(browser, viewport, atVenue);
  const atVenuePage = await atVenueContext.newPage();
  await login(atVenuePage, memberEmail);
  await atVenuePage.goto(new URL("/events/checkin", baseURL).toString());
  await atVenuePage.getByRole("button", { name: "用定位簽到" }).click();
  await expect(atVenuePage.getByText("簽到成功", { exact: false })).toBeVisible();
  await expectNoHorizontalOverflow(atVenuePage);

  await atVenuePage.reload();
  await expect(atVenuePage.getByText("已簽到", { exact: true })).toBeVisible();
  await atVenueContext.close();
});

test("the venue coordinate never reaches the member's browser", async ({ browser }, testInfo) => {
  requireCredentials();
  const viewport = testInfo.project.use.viewport ?? { width: 1440, height: 900 };
  const context = await locatedContext(browser, viewport, atVenue);
  const page = await context.newPage();
  await login(page, memberEmail);
  await page.goto(new URL("/events/checkin", baseURL).toString());
  await expect(page.getByRole("heading", { name: "用定位簽到" })).toBeVisible();

  // The page tells the member which events are eligible, but the geofence
  // centre stays server-side so it cannot be read off and spoofed against.
  const markup = await page.content();
  expect(markup).not.toContain(String(venue.latitude));
  expect(markup).not.toContain(String(venue.longitude));
  await context.close();
});
