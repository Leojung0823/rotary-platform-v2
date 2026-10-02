import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const memberEmail = "e2e-shell-ordinary@example.test";

async function signIn(page, email) {
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

async function openJoyWall(page) {
  await page.goto(new URL("/interact", baseURL).toString());
  await page.getByRole("link", { name: /歡喜牆/u }).click();
  await expect(page.getByRole("heading", { name: "分享一份歡喜" })).toBeVisible();
}

test("a member can open Joy Wall, use accessible filters, and choose who may see a share", async ({ page }) => {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for Joy Wall browser tests.");

  await signIn(page, memberEmail);
  await openJoyWall(page);
  const viewportWidth = page.viewportSize()?.width ?? 0;
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth, "Joy Wall should not create horizontal page overflow").toBeLessThanOrEqual(viewportWidth);

  const filters = page.getByRole("group", { name: "依分享類別篩選" });
  const allFilter = filters.getByRole("button", { name: "全部" });
  const thanksFilter = filters.getByRole("button", { name: "感謝" });
  const publicVisibilityOption = page.getByRole("radio", { name: /全社社員可見/u });
  await expect(allFilter).toHaveAttribute("aria-pressed", "true");
  const visibilityOptionHeight = await publicVisibilityOption.evaluate((radio) =>
    radio.closest("label")?.getBoundingClientRect().height ?? 0,
  );
  expect(visibilityOptionHeight, "visibility options should be easy to tap on mobile").toBeGreaterThanOrEqual(44);
  await thanksFilter.click();
  await expect(thanksFilter).toHaveAttribute("aria-pressed", "true");
  await expect(allFilter).toHaveAttribute("aria-pressed", "false");

  await expect(page.getByText("只在本社內依閱讀範圍顯示")).toBeVisible();

  await page.getByRole("radio", { name: /只限自己與一位社員/u }).check();
  await expect(page.getByText("選一位收件社員")).toBeVisible();
  await expect(page.getByText("內容只在您和一位社員之間顯示")).toBeVisible();

  await page.locator('section[aria-labelledby="joy-compose-title"] select').first().selectOption("iou");
  await expect(page.getByText("非現金的幫忙或承諾，不填捐款金額", { exact: false })).toBeVisible();
  await expect(page.getByLabel("指定社員")).toBeVisible();
  await expect(page.getByLabel("希望完成日期（選填）")).toBeVisible();
  await expect(page.getByRole("button", { name: "提出承諾" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /全社社員可見/u })).toHaveCount(0);
});

test("a member can privately save a post and find it again in My Favorites", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "joy-wall-1440", "This flow writes local test data and runs once.");
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for Joy Wall browser tests.");

  const title = `私人收藏驗收 ${Date.now()}`;
  const content = "這是一則只有我自己的收藏清單會記住的分享。";
  await signIn(page, "e2e-shell-member-manager@example.test");
  await openJoyWall(page);
  await page.getByLabel("一句標題（選填）").fill(title);
  await page.getByLabel("分享內容").fill(content);
  const createResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/joy/posts?") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "分享", exact: true }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);

  const postCard = page.getByRole("article").filter({ hasText: title }).first();
  await expect(postCard).toBeVisible();
  const saveButton = postCard.getByRole("button", { name: "加入我的收藏" });
  await saveButton.click();
  await expect(postCard.getByRole("button", { name: "從我的收藏移除" })).toBeVisible();
  await page.reload();
  const reloadedCard = page.getByRole("article").filter({ hasText: title }).first();
  await expect(reloadedCard.getByRole("button", { name: "從我的收藏移除" })).toBeVisible();

  const views = page.getByRole("group", { name: "切換分享範圍" });
  await views.getByRole("button", { name: "我的收藏" }).click();
  const favoriteCard = page.getByRole("article").filter({ hasText: title }).first();
  await expect(favoriteCard).toBeVisible();
  await expect(page.getByText("收藏只對自己可見")).toBeVisible();
  await favoriteCard.getByRole("button", { name: "從我的收藏移除" }).click();
  await expect(page.getByRole("article").filter({ hasText: title })).toHaveCount(0);

  await views.getByRole("button", { name: "社內動態" }).click();
  await expect(page.getByRole("article").filter({ hasText: title }).first()).toBeVisible();
});

test("a private non-cash IOU needs acceptance and two separate completion confirmations", async ({
  browser,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "joy-wall-1440", "This flow writes local test data and runs once.");
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for Joy Wall browser tests.");

  const title = `IOU 雙方流程 ${Date.now()}`;
  const content = "我會陪你整理本次服務活動的照片。";
  const dueOn = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
  let clubId = null;

  await signIn(page, "e2e-shell-member-manager@example.test");
  await openJoyWall(page);
  page.on("request", (request) => {
    if (!request.url().includes("/api/v1/joy/ious?")) return;
    clubId = new URL(request.url()).searchParams.get("club_id");
  });
  await page.locator('section[aria-labelledby="joy-compose-title"] select').first().selectOption("iou");
  await page.getByLabel("一句標題（選填）").fill(title);
  await page.getByLabel("承諾內容").fill(content);
  await page.getByLabel("指定社員").selectOption({ label: "已綁定但未加入 OA 的社員" });
  await page.getByLabel("希望完成日期（選填）").fill(dueOn);
  const createResponsePromise = page.waitForResponse((response) =>
    response.url().includes("/api/v1/joy/ious?") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "提出承諾" }).click();
  const createResponse = await createResponsePromise;
  const createPayload = await createResponse.json().catch(() => null);
  expect(createResponse.status(), `IOU create request returned ${createResponse.status()} (${createPayload?.error ?? "no error code"})`)
    .toBe(201);

  const promisorCard = page.getByRole("article").filter({ hasText: title }).first();
  await expect(page.getByText("非現金承諾已送出，只有你和指定社員看得到。")).toBeVisible();
  await expect(promisorCard.getByText("等待對方回覆")).toBeVisible();
  await expect(promisorCard.getByText(content)).toBeVisible();
  expect(clubId).toMatch(/^[0-9a-f-]{36}$/iu);

  const bystanderContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const recipientContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const bystander = await bystanderContext.newPage();
    await signIn(bystander, memberEmail);
    await bystander.goto(new URL(`/joy?clubId=${clubId}&mode=member`, baseURL).toString());
    await expect(bystander.getByRole("heading", { name: "分享一份歡喜" })).toBeVisible();
    await expect(bystander.getByText(title, { exact: true })).toHaveCount(0);

    const recipient = await recipientContext.newPage();
    await signIn(recipient, "e2e-shell-line-oa-unpaired@example.test");
    await recipient.goto(new URL(`/tasks?clubId=${clubId}&mode=member`, baseURL).toString());
    const iouTask = recipient.getByRole("link").filter({ hasText: title }).first();
    await expect(iouTask).toBeVisible();
    await iouTask.click();
    await expect(recipient).toHaveURL(/focusIouId=/u);
    const recipientCard = recipient.getByRole("article").filter({ hasText: title }).first();
    await expect(recipientCard.getByText(content)).toBeVisible();
    await expect(recipientCard.getByText("等待你回覆")).toBeVisible();
    await recipientCard.getByRole("button", { name: "答應" }).click();
    await expect(recipientCard.getByText("你已答應，等待提出者開始")).toBeVisible();

    await page.reload();
    const refreshedPromisorCard = page.getByRole("article").filter({ hasText: title }).first();
    await expect(refreshedPromisorCard.getByText("對方已答應，等待開始")).toBeVisible();
    await refreshedPromisorCard.getByRole("button", { name: "開始履行" }).click();
    await expect(refreshedPromisorCard.getByText("履行中")).toBeVisible();
    await refreshedPromisorCard.getByRole("button", { name: "確認已完成" }).click();
    await expect(refreshedPromisorCard.getByText("提出者確認完成")).toBeVisible();
    await expect(refreshedPromisorCard.getByText("履行中")).toBeVisible();

    await recipient.reload();
    const refreshedRecipientCard = recipient.getByRole("article").filter({ hasText: title }).first();
    await expect(refreshedRecipientCard.getByText("履行中")).toBeVisible();
    await refreshedRecipientCard.getByRole("button", { name: "確認已完成" }).click();
    await expect(refreshedRecipientCard.getByText("雙方已確認完成")).toBeVisible();
  } finally {
    await bystanderContext.close();
    await recipientContext.close();
  }
});

test("an invited member gets a question task that clears after an answer", async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== "joy-wall-1440", "This flow writes local test data and runs once.");
  test.setTimeout(45_000);
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for Joy Wall browser tests.");

  const questionTitle = `社員提問待辦 ${Date.now()}`;
  const questionText = "這次服務活動中，哪一個瞬間最讓你感到有意義？";
  const recipientContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const bystanderContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let clubId = null;

  try {
    await signIn(page, "e2e-shell-member-manager@example.test");
    await openJoyWall(page);
    page.on("request", (request) => {
      if (!request.url().includes("/api/v1/joy/posts?")) return;
      clubId = new URL(request.url()).searchParams.get("club_id");
    });
    await page.locator('section[aria-labelledby="joy-compose-title"] select').first().selectOption("question");
    await page.getByLabel("一句標題（選填）").fill(questionTitle);
    await page.getByLabel("分享內容").fill(questionText);
    await page.getByRole("radio", { name: /只限指定社員/u }).check();
    await page.getByRole("checkbox", { name: "已綁定但未加入 OA 的社員" }).check();
    await expect(page.getByText("指定社員可閱讀，並會收到回答待辦")).toBeVisible();

    const createResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/v1/joy/posts?") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "分享", exact: true }).click();
    const createResponse = await createResponsePromise;
    const createPayload = await createResponse.json().catch(() => null);
    expect(createResponse.status(), `question create request returned ${createResponse.status()} (${createPayload?.error ?? "no error code"})`)
      .toBe(201);
    expect(clubId).toMatch(/^[0-9a-f-]{36}$/iu);

    const recipient = await recipientContext.newPage();
    await signIn(recipient, "e2e-shell-line-oa-unpaired@example.test");
    await recipient.goto(new URL(`/tasks?clubId=${clubId}&mode=member`, baseURL).toString());
    const questionTask = recipient.getByRole("link").filter({ hasText: questionTitle }).first();
    await expect(questionTask).toBeVisible();
    await questionTask.click();
    await expect(recipient).toHaveURL(/focusPostId=/u);

    const questionCard = recipient.getByRole("article").filter({ hasText: questionTitle }).first();
    await expect(questionCard.getByText(questionText)).toBeVisible();
    const answerType = questionCard.getByLabel("留言性質");
    await expect(answerType).toHaveValue("answer");
    await questionCard.getByLabel("寫下回應").fill("最難忘的是大家一起完成最後一箱物資整理。");
    const answerResponsePromise = recipient.waitForResponse((response) =>
      response.url().includes("/comments?") && response.request().method() === "POST",
    );
    await questionCard.getByRole("button", { name: "送出回答" }).click();
    const answerResponse = await answerResponsePromise;
    expect(answerResponse.status()).toBe(201);

    await recipient.goto(new URL(`/tasks?clubId=${clubId}&mode=member`, baseURL).toString());
    await expect(recipient.getByRole("link").filter({ hasText: questionTitle })).toHaveCount(0);

    const bystander = await bystanderContext.newPage();
    await signIn(bystander, memberEmail);
    await bystander.goto(new URL(`/tasks?clubId=${clubId}&mode=member`, baseURL).toString());
    await expect(bystander.getByRole("link").filter({ hasText: questionTitle })).toHaveCount(0);
    await bystander.goto(new URL(`/joy?clubId=${clubId}&mode=member`, baseURL).toString());
    await expect(bystander.getByText(questionTitle, { exact: true })).toHaveCount(0);
  } finally {
    await recipientContext.close();
    await bystanderContext.close();
  }
});

test("club officers can batch different private Joy questions while ordinary members are denied the manager page", async ({
  browser,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "joy-wall-1440", "This flow writes local test data and runs once.");
  test.setTimeout(45_000);
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for Joy Wall browser tests.");

  const batchTitle = `批次不同題目 ${Date.now()}`;
  const memberContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await signIn(page, "e2e-shell-member-manager@example.test");
    await page.goto(new URL("/joy?mode=management", baseURL).toString());
    const managerLink = page.getByRole("link", { name: "題庫與派題" });
    await expect(managerLink).toBeVisible();
    const questionsHref = await managerLink.getAttribute("href");
    expect(questionsHref).toBeTruthy();
    const clubId = new URL(questionsHref, baseURL).pathname.match(/\/clubs\/([^/]+)\/joy\/questions/u)?.[1];
    expect(clubId).toMatch(/^[0-9a-f-]{36}$/iu);

    await page.goto(new URL(questionsHref, baseURL).toString());
    await expect(page.getByRole("heading", { name: "提問題庫與派發" })).toBeVisible();
    const recipients = page.getByRole("group", { name: "派給哪些社員（最多 250 位）" });
    await recipients.getByRole("checkbox", { name: "一般社員" }).check();
    await recipients.getByRole("checkbox", { name: "已綁定但未加入 OA 的社員" }).check();
    await page.getByLabel("這批任務的名稱").fill(batchTitle);
    page.once("dialog", (dialog) => dialog.accept());
    const dispatchResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/v1/joy/question-batches?") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "派發給 2 位社員" }).click();
    const dispatchResponse = await dispatchResponsePromise;
    const payload = await dispatchResponse.json().catch(() => null);
    expect(dispatchResponse.status(), `batch dispatch returned ${dispatchResponse.status()} (${payload?.error ?? "no error code"})`)
      .toBe(201);

    const batchCard = page.locator("article").filter({ hasText: batchTitle }).last();
    await expect(batchCard.getByText("0/2 已回答", { exact: false })).toBeVisible();
    await batchCard.getByRole("button", { name: "查看明細" }).click();
    const promptRows = batchCard.locator("li > div > span");
    await expect(promptRows).toHaveCount(2);
    const prompts = await promptRows.allTextContents();
    expect(new Set(prompts).size, "each assignee must get a different prompt").toBe(2);

    const ordinaryMember = await memberContext.newPage();
    await signIn(ordinaryMember, memberEmail);
    await ordinaryMember.goto(new URL(`/clubs/${clubId}/joy/questions?mode=management`, baseURL).toString());
    await expect(ordinaryMember).toHaveURL(/\/access-denied(?:\?|$)/u);
    await expect(ordinaryMember.getByRole("heading", { name: "無法存取", exact: true })).toBeVisible();
  } finally {
    await memberContext.close();
  }
});
