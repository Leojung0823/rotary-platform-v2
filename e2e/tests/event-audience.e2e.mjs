import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const officerEmail = "e2e-shell-member-manager@example.test";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for event audience browser tests.");
}

async function openEventForm(page) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(officerEmail);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await page.goto(new URL("/events?mode=management", baseURL).toString());
  await expect(page).toHaveURL(/\/clubs\/[0-9a-f-]+\/events\?mode=management$/u);
  await expect(page.getByRole("heading", { name: "建立活動草稿" })).toBeVisible();
}

test("the picker starts on the whole club and says how many that is", async ({ page }) => {
  await openEventForm(page);

  const everyone = page.getByRole("radio", { name: "全社" });
  await expect(everyone).toBeChecked();
  // The count comes from the server, because two tags overlap and adding
  // their member counts would overstate the audience.
  await expect(page.getByText(/^\d+ 位社員$/u)).toBeVisible();

  // Attendance is available for a club-wide event.
  await expect(page.getByLabel(/計入出席/u)).toBeEnabled();
});

test("choosing an audience disables 計入出席 and explains why", async ({ page }) => {
  await openEventForm(page);

  await page.getByRole("radio", { name: "指定社員" }).click();
  const attendance = page.getByLabel(/計入出席/u);
  // Nothing ticked yet still means the whole club, so attendance stays open.
  await expect(attendance).toBeEnabled();
  await expect(page.getByText("尚未選擇任何對象，目前等同於發給全社。")).toBeVisible();

  await page.locator(".tag-option input").first().check();
  await expect(attendance).toBeDisabled();
  await expect(page.getByText("已指定發送對象，因此不是例會，不會計入出席率。")).toBeVisible();

  // And switching back releases it, rather than leaving the form stuck.
  await page.getByRole("radio", { name: "全社" }).click();
  await expect(attendance).toBeEnabled();
});

test("a targeted draft is created without counting for attendance", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "event-audience-1440", "Creating events mutates shared fixture data.");
  await openEventForm(page);

  const title = `受眾測試活動 ${Date.now()}`;
  await page.getByLabel("活動名稱").fill(title);
  await page.getByLabel("開始時間").fill("2027-03-01T10:00");
  await page.getByLabel("結束時間").fill("2027-03-01T12:00");
  await page.getByLabel("報名截止").fill("2027-02-25T10:00");

  await page.getByRole("radio", { name: "指定社員" }).click();
  await page.locator(".tag-option input").first().check();
  await expect(page.getByLabel(/計入出席/u)).toBeDisabled();

  await page.getByRole("button", { name: /建立草稿|建立中/u }).click();

  const card = page.locator("article.card").filter({ hasText: title });
  await expect(card).toBeVisible();
  // The badge is only rendered for events that count, so its absence is the
  // assertion: a targeted event must never carry it.
  await expect(card.getByText("計入出席")).toHaveCount(0);
});
