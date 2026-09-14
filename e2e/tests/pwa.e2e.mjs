import { expect, test } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

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
