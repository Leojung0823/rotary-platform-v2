import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const mockLineSigningSecret = process.env.E2E_LINE_MOCK_SIGNING_SECRET;
const standaloneUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

function signLocalMockLineAuthorization({ subject, displayName, email, nonce }) {
  if (!mockLineSigningSecret) throw new Error("E2E_LINE_MOCK_SIGNING_SECRET is required for local LINE Login acceptance.");
  const payload = Buffer.from(JSON.stringify({ subject, displayName, email, nonce, issuedAt: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", mockLineSigningSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function launchStandaloneContext(browserType, userDataDirectory) {
  const context = await browserType.launchPersistentContext(userDataDirectory, {
    viewport: { width: 390, height: 844 },
    userAgent: standaloneUserAgent,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
  });
  return context;
}

async function expectPathname(page, pathname) {
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
}

test("公開安裝頁、Manifest 與圖示具備 PWA 安裝所需資料", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-1440", "PWA acceptance runs in its dedicated project.");

  const manifestResponse = await request.get(new URL("/manifest.webmanifest", baseURL).toString());
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    id: "/",
    name: "我是扶輪人",
    short_name: "我是扶輪人",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
  });

  for (const [src, dimension] of [
    ["/icons/icon-192.png", 192],
    ["/icons/icon-512.png", 512],
    ["/icons/icon-maskable-512.png", 512],
    ["/icons/apple-touch-icon.png", 180],
  ]) {
    const iconResponse = await request.get(new URL(src, baseURL).toString());
    expect(iconResponse.ok(), `${src} should be served`).toBeTruthy();
    expect(iconResponse.headers()["content-type"]).toContain("image/png");
    const icon = Buffer.from(await iconResponse.body());
    expect(icon.toString("hex", 0, 8)).toBe("89504e470d0a1a0a");
    expect(icon.readUInt32BE(16)).toBe(dimension);
    expect(icon.readUInt32BE(20)).toBe(dimension);
  }

  const appVersionResponse = await request.get(new URL("/api/app-version", baseURL).toString());
  expect(appVersionResponse.ok()).toBeTruthy();
  const appVersion = await appVersionResponse.json();
  expect(appVersion.buildId).toBeTruthy();
  expect(appVersionResponse.headers()["cache-control"]).toContain("no-store");

  await page.goto(new URL("/install?openExternalBrowser=1", baseURL).toString());
  await expect(page.locator("body")).toHaveAttribute("data-app-build-id", appVersion.buildId);
  await expect(page.getByRole("heading", { name: "安裝「我是扶輪人」" })).toBeVisible();
  await expect(page.getByRole("button", { name: "複製安裝連結" })).toBeVisible();
  await expect(page.getByRole("link", { name: "前往登入" })).toHaveAttribute("href", "/login");
  await expect(page.locator("body")).not.toContainText("PWA");
});

test("複製安裝連結時附上 LINE 外部瀏覽器參數", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-1440", "PWA acceptance runs in its dedicated project.");
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value) {
          window.__pwaCopiedInstallLink = value;
        },
      },
    });
  });
  const page = await context.newPage();
  await page.goto(new URL("/install", baseURL).toString());
  await page.getByRole("button", { name: "複製安裝連結" }).click();
  await expect(page.getByText("安裝連結已複製，可以貼到 LINE 分享給社友。", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__pwaCopiedInstallLink))
    .toBe(new URL("/install?openExternalBrowser=1", baseURL).toString());
  await context.close();
});

test("iPhone 安裝頁顯示加入主畫面的三步驟", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-1440", "PWA acceptance runs in its dedicated project.");
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(new URL("/install", baseURL).toString());
  await expect(page.getByRole("heading", { name: "iPhone：加入主畫面" })).toBeVisible();
  await expect(page.getByText("點「分享」", { exact: false })).toBeVisible();
  await expect(page.getByText("Safari 畫面下方", { exact: false })).toBeVisible();
  await expect(page.getByText("加入主畫面", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("第一次從桌面開啟時", { exact: false })).toBeVisible();
  await context.close();
});

test("LINE 內建瀏覽器會在安裝入口立即顯示外開教學", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-1440", "PWA acceptance runs in its dedicated project.");
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 Line/13.0.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(new URL("/install?openExternalBrowser=1", baseURL).toString());
  await expect(page.getByText("請先用瀏覽器開啟", { exact: true })).toBeVisible();
  await expect(page.getByText("選擇「用瀏覽器開啟」", { exact: false })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("PWA");
  await context.close();
});

test("Android 安裝頁在沒有一鍵提示時顯示手動安裝路徑", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-1440", "PWA acceptance runs in its dedicated project.");
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(new URL("/install", baseURL).toString());
  await expect(page.getByRole("heading", { name: "Android：安裝到手機" })).toBeVisible();
  await expect(page.getByText("加到主畫面", { exact: true })).toBeVisible();
  await expect(page.getByText("安裝應用程式", { exact: true })).toBeVisible();
  await context.close();
});

test("Android 收到一鍵安裝事件時會呼叫系統提示", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-1440", "PWA acceptance runs in its dedicated project.");
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36",
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(new URL("/install", baseURL).toString());
  await expect.poll(() => page.evaluate(() => {
    const promptEvent = new Event("beforeinstallprompt", { cancelable: true });
    Object.defineProperty(promptEvent, "prompt", {
      value: async () => { window.__pwaPromptCount = (window.__pwaPromptCount ?? 0) + 1; },
    });
    Object.defineProperty(promptEvent, "userChoice", {
      value: Promise.resolve({ outcome: "accepted", platform: "web" }),
    });
    window.dispatchEvent(promptEvent);
    return promptEvent.defaultPrevented;
  })).toBe(true);
  await page.getByRole("button", { name: "安裝到手機" }).click();
  await expect.poll(() => page.evaluate(() => window.__pwaPromptCount)).toBe(1);
  await context.close();
});

test("桌面獨立視窗不顯示安裝步驟", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-1440", "PWA acceptance runs in its dedicated project.");
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
  });
  const page = await context.newPage();
  await page.goto(new URL("/install", baseURL).toString());
  await expect(page.getByRole("heading", { name: "已從桌面開啟「我是扶輪人」" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "在手機上安裝" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "iPhone：加入主畫面" })).toHaveCount(0);
  await context.close();
});

// This exercises the app's local mock callback and cookie persistence in an
// installed-mode Chromium profile. Real iOS/Android LINE Login remains a
// separate device-acceptance gate.
test("本機模擬 LINE Login 後，獨立模式瀏覽器重開仍保留 Supabase Session", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-1440", "PWA acceptance runs in its dedicated project.");
  test.skip(
    !process.env.E2E_ROLE_PASSWORD || !mockLineSigningSecret || process.env.E2E_REMOTE === "1",
    "Requires the isolated local LINE identity fixture; never runs against a remote environment.",
  );

  const userDataDirectory = await mkdtemp(join(tmpdir(), "rotary-pwa-standalone-"));
  const browserType = browser.browserType();
  let context;

  try {
    context = await launchStandaloneContext(browserType, userDataDirectory);
    let page = context.pages()[0] ?? await context.newPage();
    await page.goto(new URL("/api/auth/line/start?returnTo=%2Fdashboard", baseURL).toString());
    await expect(page.getByRole("heading", { name: "模擬 LINE Login" })).toBeVisible();
    const authorization = new URL(page.url());
    const state = authorization.searchParams.get("state");
    const nonce = authorization.searchParams.get("nonce");
    expect(state).toBeTruthy();
    expect(nonce).toBeTruthy();

    // A real OAuth provider returns with a top-level document navigation.
    // Signing the local mock payload here avoids Next's Server Action client
    // redirect issuing an extra callback request before that document return.
    const code = signLocalMockLineAuthorization({
      subject: "U-e2e-shell-line-oa-unpaired",
      displayName: "測試社員",
      email: "member@example.test",
      nonce,
    });
    const callbackUrl = new URL("/api/auth/line/callback", baseURL);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("state", state);
    const callbackResponse = await page.goto(callbackUrl.toString());
    expect(callbackResponse?.ok()).toBeTruthy();
    await expectPathname(page, "/dashboard");
    await expect(page.locator("main h1").first()).toContainText("，您好");
    await page.goto(new URL("/install", baseURL).toString());
    await expect(page.getByRole("heading", { name: "已從桌面開啟「我是扶輪人」" })).toBeVisible();

    await context.close();
    context = null;
    context = await launchStandaloneContext(browserType, userDataDirectory);
    page = context.pages()[0] ?? await context.newPage();
    await page.goto(new URL("/dashboard", baseURL).toString());
    await expectPathname(page, "/dashboard");
    await expect(page.locator("main h1").first()).toContainText("，您好");
  } finally {
    await context?.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});

test("偵測到新版後提示使用者，只有點擊更新才要求啟用等待中的版本", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-1440", "PWA acceptance runs in its dedicated project.");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    const waiting = {
      postMessage(message) {
        window.__pwaWorkerMessage = message;
      },
    };
    const registration = {
      waiting,
      installing: null,
      addEventListener() {},
      removeEventListener() {},
      async update() {},
    };
    const serviceWorker = {
      controller: {},
      async register() { return registration; },
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  });
  const page = await context.newPage();
  await page.goto(new URL("/install", baseURL).toString());
  await expect(page.getByText("「我是扶輪人」有新版本", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "點此更新" }).click();
  await expect.poll(() => page.evaluate(() => window.__pwaWorkerMessage?.type)).toBe("SKIP_WAITING");
  await context.close();
});

test("build ID 不同時提示更新；沒有等待中的 Service Worker 時點擊會重新載入", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-1440", "PWA acceptance runs in its dedicated project.");
  const context = await browser.newContext();
  const page = await context.newPage();
  let reportedBuildId = "newer-test-build-id";
  await page.route("**/api/app-version", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
    body: JSON.stringify({ buildId: reportedBuildId }),
  }));
  await page.addInitScript(() => {
    const registration = {
      waiting: null,
      installing: null,
      addEventListener() {},
      removeEventListener() {},
      async update() {},
    };
    const serviceWorker = {
      controller: {},
      async register() { return registration; },
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  });

  await page.goto(new URL("/install", baseURL).toString());
  const renderedBuildId = await page.locator("body").getAttribute("data-app-build-id");
  expect(renderedBuildId).toBeTruthy();
  expect(reportedBuildId).not.toBe(renderedBuildId);
  await expect(page.getByText("「我是扶輪人」有新版本", { exact: true })).toBeVisible();

  reportedBuildId = renderedBuildId;
  await Promise.all([
    page.waitForNavigation(),
    page.getByRole("button", { name: "點此更新" }).click(),
  ]);
  await expect(page.getByText("「我是扶輪人」有新版本", { exact: true })).toHaveCount(0);
  await context.close();
});

test("離線導覽只顯示安全提示，不提供登入後內容", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-1440", "PWA offline flow runs in its dedicated project.");

  await page.goto(new URL("/login", baseURL).toString());
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await page.evaluate(async () => {
    const offlineResponse = await caches.match("/offline.html");
    if (!offlineResponse) throw new Error("The offline safety page was not cached.");
  });

  await context.setOffline(true);
  await page.goto(new URL("/dashboard", baseURL).toString(), { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "目前沒有網路" })).toBeVisible();
  await expect(page.getByText("不會顯示或保存登入後的內容", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "LEO，您好" })).toHaveCount(0);
});
