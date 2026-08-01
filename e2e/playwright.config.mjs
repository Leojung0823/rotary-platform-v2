import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const remoteRun = process.env.E2E_REMOTE === "1";
const sensitiveRun = process.env.E2E_SENSITIVE === "1";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.mjs",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: sensitiveRun ? 0 : process.env.CI ? 1 : 0,
  // Several legacy browser flows intentionally rotate the one local synthetic
  // administrator password. Keep the suite deterministic in every mode.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: sensitiveRun
    ? [["line"]]
    : process.env.CI
      ? [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]]
      : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    browserName: "chromium",
    trace: sensitiveRun ? "off" : "on-first-retry",
    screenshot: sensitiveRun ? "off" : "only-on-failure",
    video: sensitiveRun ? "off" : "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "android-chromium",
      use: {
        viewport: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2.625,
      },
    },
  ],
  webServer: remoteRun
    ? undefined
    : {
        command: "node --env-file=.env.local node_modules/next/dist/bin/next start -H 127.0.0.1",
        cwd: repositoryRoot,
        url: `${baseURL}/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
