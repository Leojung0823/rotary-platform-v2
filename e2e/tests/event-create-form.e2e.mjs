import { expect, test } from "@playwright/test";

const email = "e2e-shell-management@example.test";
const password = process.env.E2E_ROLE_PASSWORD;

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for event-create browser smoke tests.");
}

async function login(page) {
  requireCredentials();
  await page.goto("/login");
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
  await page.goto("/events?mode=management");
  await expect(page.getByRole("heading", { name: "建立活動草稿" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => Math.max(
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
    document.body.scrollWidth - document.body.clientWidth,
  ));
  expect(overflow).toBeLessThanOrEqual(1);
}

test("recoverable event-create failure retains the form and exposes an accessible error", async ({ page }, testInfo) => {
  await login(page);
  await page.getByLabel("活動類型").selectOption("service");
  await page.getByLabel("活動名稱").fill("本機表單保留服務活動");
  await page.getByLabel("開始時間（台北）").fill("2026-08-20T18:30");
  await page.getByLabel("結束時間（台北）").fill("2026-08-20T18:00");
  await page.getByLabel("報名截止（台北，選填）").fill("2026-08-19T18:30");
  await page.getByLabel("名額（留空表示不限）").fill("80");
  await page.getByLabel("地點").fill("本機河濱公園");
  await page.getByLabel("活動說明").fill("請攜帶手套與飲水。");
  const countsForAttendance = page.getByLabel("計入出席");
  await countsForAttendance.focus();
  await page.keyboard.press("Space");

  const submit = page.getByRole("button", { name: "建立草稿" });
  await submit.focus();
  await page.keyboard.press("Enter");

  const errorSummary = page.getByRole("alert", { name: "建立活動錯誤" });
  await expect(errorSummary).toContainText("請修正下列欄位後再建立活動草稿。");
  await expect(page.locator("#event-create-endsAt-error")).toHaveText("結束時間必須晚於開始時間。");
  await expect(page.getByLabel("活動類型")).toHaveValue("service");
  await expect(page.getByLabel("活動名稱")).toHaveValue("本機表單保留服務活動");
  await expect(page.getByLabel("開始時間（台北）")).toHaveValue("2026-08-20T18:30");
  await expect(page.getByLabel("結束時間（台北）")).toHaveValue("2026-08-20T18:00");
  await expect(page.getByLabel("報名截止（台北，選填）")).toHaveValue("2026-08-19T18:30");
  await expect(page.getByLabel("名額（留空表示不限）")).toHaveValue("80");
  await expect(page.getByLabel("地點")).toHaveValue("本機河濱公園");
  await expect(page.getByLabel("活動說明")).toHaveValue("請攜帶手套與飲水。");
  await expect(page.getByLabel("計入出席")).not.toBeChecked();
  await expect(page.getByLabel("結束時間（台北）")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("結束時間（台北）")).toHaveAttribute("aria-describedby", "event-create-endsAt-error");
  await expectNoHorizontalOverflow(page);

  if (testInfo.project.name === "event-create-1440") {
    await expect(page.getByLabel("結束時間（台北）")).toBeFocused();
  }
  if (testInfo.project.name === "event-create-768") {
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await expect(page.getByRole("button", { name: "建立草稿" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test("報名截止留空，真的存得進去", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "event-create-1440", "One creation per run is enough.");
  // The field has said 「選填」 since #172 and the column has been nullable
  // since #172, but both writers still carried `or p_registration_deadline is
  // null` in their reject lists -- so leaving it blank, exactly as the label
  // invites, answered 「輸入資料不正確」.
  //
  // Nothing caught it because every test that touches this field fills it in.
  // This one does not.
  await login(page);
  const title = `本機留空截止活動 ${Date.now()}`;
  const future = new Date(Date.now() + 40 * 24 * 60 * 60_000);
  const at = (hour) => `${future.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;

  await page.getByLabel("活動類型").selectOption("regular_meeting");
  await page.getByLabel("活動名稱").fill(title);
  await page.getByLabel("開始時間（台北）").fill(at(18));
  await page.getByLabel("結束時間（台北）").fill(at(20));
  await page.getByLabel("地點").fill("本機留空截止會館");
  // 報名截止 is deliberately left untouched.
  await expect(page.getByLabel("報名截止（台北，選填）")).toHaveValue("");
  await page.getByRole("button", { name: "建立草稿" }).click();

  await expect(page).toHaveURL(/success=event_created/u, { timeout: 30_000 });
  const card = page.locator("article.card").filter({ hasText: title }).first();
  await expect(card).toBeVisible();
  // And the card says what a blank means rather than showing an empty field.
  await expect(card).toContainText("不設截止，活動結束前都可報名");

  // Publishing is the other writer that used to compare the deadline itself.
  await card.getByRole("button", { name: "發布活動" }).click();
  await expect(page).toHaveURL(/success=event_published/u, { timeout: 30_000 });
  await expect(
    page.locator("article.card").filter({ hasText: title }).first().getByText("已發布", { exact: true }),
  ).toBeVisible();
});
