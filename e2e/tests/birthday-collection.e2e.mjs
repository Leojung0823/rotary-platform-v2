import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const clubId = "a1000000-0000-4000-8000-000000000003";
const managerEmail = "e2e-shell-management@example.test";
const memberEmail = "e2e-shell-ordinary@example.test";
const multiMemberEmail = "e2e-shell-multi@example.test";

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for birthday collection browser tests.");
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

async function waitForState(page, readState, label) {
  try {
    await expect.poll(readState, { timeout: 3_000 }).toBe(true);
  } catch {
    // A Server Action can finish its database mutation while the browser is
    // still holding the redirect response. Reload once, then assert the
    // durable projection rather than depending on the URL transition timing.
    await page.reload();
    await expect.poll(readState, { timeout: 12_000, message: label }).toBe(true);
  }
}

async function submitBirthdayAction(page, button) {
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    return request.method() === "POST" && new URL(response.url()).pathname === "/birthday-collection";
  }, { timeout: 20_000 });
  await button.click();
  await responsePromise;
}

function taipeiPeriod() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  return {
    month: Number(parts.find((part) => part.type === "month")?.value ?? 1),
  };
}

async function findUnusedBirthdayYear(managerWorkspace) {
  const existingYears = new Set(
    (await managerWorkspace.locator("section.card p").allTextContents())
      .map((value) => value.trim().match(/^(\d{4})-\d{2}-\d{2}$/u)?.[1])
      .filter(Boolean)
      .map(Number),
  );
  for (let year = 2000; year <= 2200; year += 1) {
    if (!existingYears.has(year)) return year;
  }
  throw new Error("生日徵集測試沒有可用的唯一年份");
}

test.describe("生日祝福徵集瀏覽器回歸", () => {
  test("幹部建立並發布後，壽星只看到匿名作者", async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "birthday-collection-1440", "This flow mutates shared local birthday fixtures.");
    test.setTimeout(90_000);

    await login(page, managerEmail);
    await page.goto(new URL(`/birthday-collection?clubId=${clubId}`, baseURL).toString());
    await expect(page.getByRole("heading", { name: "生日祝福徵集" })).toBeVisible();
    await expect(page.getByText(/管理題庫（平台 100 題／本社 \d+ 題）/u)).toBeVisible();
    const campaignWorkspace = page.locator("section").filter({ has: page.getByRole("heading", { name: "生日徵集狀態" }) }).first();
    const managerWorkspace = page.locator("section").filter({ has: page.getByRole("heading", { name: "祝福內容管理" }) }).first();
    await expect(managerWorkspace).toBeVisible();

    const questionKey = `e2e_birthday_${Date.now()}`;
    const questionPrompt = `瀏覽器題庫測試 ${Date.now()}`;
    const updatedQuestionPrompt = `${questionPrompt}（已修改）`;
    const questionBank = page.locator("details").filter({ hasText: "管理題庫" }).first();
    const createQuestionForm = questionBank.locator("form").first();
    await questionBank.locator("summary").click();
    await createQuestionForm.getByLabel("題目代碼").fill(questionKey);
    await createQuestionForm.getByLabel("題目內容").fill(questionPrompt);
    await createQuestionForm.getByLabel("路線").selectOption("warm");
    await createQuestionForm.getByLabel("排序").fill("321");
    await submitBirthdayAction(page, createQuestionForm.getByRole("button", { name: "加入本社題庫" }));
    await page.reload();
    await questionBank.locator("summary").click();
    let questionEditor = questionBank.locator("form").filter({ hasText: questionKey }).first();
    await expect(questionEditor).toBeVisible();
    await expect(questionEditor.getByLabel("題目內容")).toHaveValue(questionPrompt);
    await questionEditor.getByLabel("題目內容").fill(updatedQuestionPrompt);
    await questionEditor.getByLabel("路線").selectOption("humorous");
    await questionEditor.getByLabel("排序").fill("322");
    await submitBirthdayAction(page, questionEditor.getByRole("button", { name: "儲存題目" }));
    await page.reload();
    await questionBank.locator("summary").click();
    questionEditor = questionBank.locator("form").filter({ hasText: questionKey }).first();
    await expect(questionEditor.getByLabel("題目內容")).toHaveValue(updatedQuestionPrompt);
    await expect(questionEditor.getByLabel("路線")).toHaveValue("humorous");
    await expect(questionEditor.getByLabel("排序")).toHaveValue("322");
    const enabledQuestion = questionEditor.locator('input[name="isEnabled"]');
    await expect(enabledQuestion).toBeChecked();
    await enabledQuestion.uncheck();
    await submitBirthdayAction(page, questionEditor.getByRole("button", { name: "儲存題目" }));
    await page.reload();
    await questionBank.locator("summary").click();
    questionEditor = questionBank.locator("form").filter({ hasText: questionKey }).first();
    await expect(questionEditor.getByLabel("題目內容")).toHaveValue(updatedQuestionPrompt);
    await expect(questionEditor.locator('input[name="isEnabled"]')).not.toBeChecked();

    // A fresh year keeps this append-only flow repeatable without deleting
    // published submissions from the local fixture database.
    const { month: birthdayMonth } = taipeiPeriod();
    const birthdayYear = await findUnusedBirthdayYear(campaignWorkspace);
    const birthdayDate = `${birthdayYear}-${String(birthdayMonth).padStart(2, "0")}-28`;
    await page.getByLabel("生日年份").fill(String(birthdayYear));
    await page.getByLabel("生日月份").fill(String(birthdayMonth));
    await page.getByRole("button", { name: "建立／重跑本月任務" }).click();
    await waitForState(
      page,
      async () => (await page.getByText(birthdayDate, { exact: true }).count()) > 0,
      "生日月份任務沒有出現在幹部工作台",
    );

    const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const multiMemberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const memberPage = await memberContext.newPage();
      await login(memberPage, memberEmail);
      await memberPage.goto(new URL(`/birthday-collection?clubId=${clubId}`, baseURL).toString());

      const multiMemberPage = await multiMemberContext.newPage();
      await login(multiMemberPage, multiMemberEmail);
      await multiMemberPage.goto(new URL(`/birthday-collection?clubId=${clubId}`, baseURL).toString());
      const multiAssignmentCard = multiMemberPage.locator("section.card")
        .filter({ hasText: birthdayDate })
        .filter({ hasText: "寫給 一般社員" })
        .first();
      await expect(multiAssignmentCard).toBeVisible();
      await multiAssignmentCard.getByRole("button", { name: "婉拒這一則自動任務" }).click();
      await waitForState(
        multiMemberPage,
        async () => (await multiMemberPage.getByText("您已婉拒這一則自動派發的生日祝福任務。", { exact: true }).count()) === 1,
        "社員婉拒任務後沒有顯示完成訊息",
      );
      await expect(multiAssignmentCard.getByRole("button", { name: "婉拒這一則自動任務" })).toHaveCount(0);

      await page.reload();
      const declinedManagerCard = managerWorkspace.locator("section.card")
        .filter({ hasText: "多社社員" })
        .filter({ hasText: "婉拒任務" })
        .first();
      await expect(declinedManagerCard).toBeVisible();
      const declinedHistory = declinedManagerCard.locator("details").filter({ hasText: "處理紀錄" }).first();
      await declinedHistory.locator("summary").click();
      await expect(declinedHistory.getByText("婉拒任務", { exact: true })).toBeVisible();

      const assignmentCard = memberPage.locator("section.card")
        .filter({ hasText: birthdayDate })
        .filter({ hasText: "寫給 多社社員" })
        .first();
      const assignment = assignmentCard.locator('textarea[name="content"]');
      await expect(assignmentCard).toBeVisible();
      await expect(assignment).toBeVisible();
      const content = `瀏覽器生日徵集驗收 ${Date.now()}`;
      await assignment.fill(content);
      await submitBirthdayAction(memberPage, assignmentCard.getByRole("button", { name: "送出祝福" }));
      await memberPage.reload();
      await expect(assignment).toHaveValue(content);

      await page.reload();
      const submittedCard = managerWorkspace.locator("section.card").filter({ hasText: content }).first();
      await expect(submittedCard).toBeVisible();
      await submittedCard.getByRole("button", { name: "發布這則祝福" }).click();
      await waitForState(
        page,
        async () => (await submittedCard.getByRole("button", { name: "隱藏並要求重新送出" }).count()) === 1,
        "生日祝福發布後，幹部卡片沒有進入已發布狀態",
      );

      await memberPage.reload();

      const publicWall = memberPage.locator("section").filter({ has: memberPage.getByRole("heading", { name: "生日祝福牆" }) }).first();
      const publicCard = publicWall.locator("section.card").filter({ hasText: content }).first();
      await expect(publicCard).toBeVisible();
      await expect(publicCard.getByText("匿名祝福者", { exact: true })).toBeVisible();
      await expect(publicCard.getByText("一般社員", { exact: true })).toHaveCount(0);
      await expect(memberPage.getByRole("heading", { name: "幹部工作台" })).toHaveCount(0);
      await expect(memberPage.getByText("管理題庫", { exact: false })).toHaveCount(0);

      await page.reload();
      const publishedManagerCard = managerWorkspace.locator("section.card").filter({ hasText: content }).first();
      const hideButton = publishedManagerCard.getByRole("button", { name: "隱藏並要求重新送出" });
      await expect(hideButton).toBeVisible();
      await hideButton.click();
      await waitForState(
        page,
        async () => (await publishedManagerCard.getByText("已隱藏", { exact: true }).count()) === 1,
        "生日祝福隱藏後，幹部卡片沒有進入已隱藏狀態",
      );

      await memberPage.reload();
      await expect(assignmentCard.getByText("上一版已被幹部隱藏", { exact: false })).toBeVisible();
      const revisedContent = `瀏覽器生日徵集重送 ${Date.now()}`;
      await assignment.fill(revisedContent);
      await assignmentCard.getByRole("button", { name: "重新送出祝福" }).click();
      await waitForState(
        memberPage,
        async () => (await assignmentCard.getByRole("button", { name: "更新祝福" }).count()) === 1,
        "生日祝福重新送出後，社員任務沒有回到可編輯狀態",
      );

      await page.reload();
      const revisedManagerCard = managerWorkspace.locator("section.card").filter({ hasText: revisedContent }).first();
      await expect(revisedManagerCard).toBeVisible();
      await revisedManagerCard.getByRole("button", { name: "發布這則祝福" }).click();
      await waitForState(
        page,
        async () => (await revisedManagerCard.getByRole("button", { name: "隱藏並要求重新送出" }).count()) === 1,
        "生日祝福重新送出後，幹部再次發布沒有完成",
      );

      await memberPage.reload();
      const revisedPublicWall = memberPage.locator("section").filter({ has: memberPage.getByRole("heading", { name: "生日祝福牆" }) }).first();
      await expect(revisedPublicWall.getByText(content, { exact: true })).toHaveCount(0);
      const revisedPublicCard = revisedPublicWall.locator("section.card").filter({ hasText: revisedContent }).first();
      await expect(revisedPublicCard).toBeVisible();
      await expect(revisedPublicCard.getByText("匿名祝福者", { exact: true })).toBeVisible();

      await page.reload();
      const historyCard = managerWorkspace.locator("section.card").filter({ hasText: revisedContent }).first();
      const history = historyCard.locator("details").filter({ hasText: "處理紀錄" }).first();
      await history.locator("summary").click();
      await expect(history).toHaveAttribute("open", "");
      await expect(history.getByText("隱藏已發布內容", { exact: true }).first()).toBeVisible();
      await expect(history.getByText("重新送出", { exact: true }).first()).toBeVisible();
    } finally {
      await multiMemberContext.close();
      await memberContext.close();
    }
  });

  test("412px 社員畫面沒有水平溢位，且保留任務入口", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "birthday-collection-412", "This assertion targets the mobile birthday collection project.");

    await login(page, memberEmail);
    await page.goto(new URL(`/birthday-collection?clubId=${clubId}`, baseURL).toString());
    await expect(page.getByRole("heading", { name: "生日祝福徵集" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "我的生日祝福任務" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
