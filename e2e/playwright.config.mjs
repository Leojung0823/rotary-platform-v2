import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const remoteRun = process.env.E2E_REMOTE === "1";
const sensitiveRun = process.env.E2E_SENSITIVE === "1";
const roleShellCoreTestMatch = /role-shells\.e2e\.mjs/;
const roleShellDisabledTestMatch = /role-shells-off\.e2e\.mjs/;
const roleShellForceTestMatch = /role-shells-force-legacy\.e2e\.mjs/;
const eventCreateTestMatch = /event-create-form\.e2e\.mjs/;
const rollbackScenario = process.env.E2E_ROLE_SHELL_ROLLBACK;
const memberHomeCoreTestMatch = /member-home\.e2e\.mjs/;
const memberHomeDisabledTestMatch = /member-home-off\.e2e\.mjs/;
const memberHomeForceTestMatch = /member-home-force-legacy\.e2e\.mjs/;
const memberHomeRollbackScenario = process.env.E2E_MEMBER_HOME_ROLLBACK;
const dynamicCheckinTestMatch = /dynamic-checkin\.e2e\.mjs/;
const locationCheckinTestMatch = /location-checkin\.e2e\.mjs/;
const mobileNavTestMatch = /mobile-nav-contrast\.e2e\.mjs/;
const eventCoverTestMatch = /event-cover\.e2e\.mjs/;
const dynamicCheckinOffTestMatch = /dynamic-checkin-off\.e2e\.mjs/;
const dynamicCheckinRollbackScenario = process.env.E2E_CHECKIN_QR_ROLLBACK;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.e2e.mjs",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: sensitiveRun ? 0 : process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
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
      testIgnore: /role-shells.*\.e2e\.mjs|event-create-form\.e2e\.mjs|member-home.*\.e2e\.mjs|dynamic-checkin.*\.e2e\.mjs|location-checkin\.e2e\.mjs|mobile-nav-contrast\.e2e\.mjs|event-cover\.e2e\.mjs/,
    },
    {
      name: "android-chromium",
      use: {
        viewport: { width: 412, height: 915 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2.625,
      },
      testIgnore: /role-shells.*\.e2e\.mjs|event-create-form\.e2e\.mjs|member-home.*\.e2e\.mjs|dynamic-checkin.*\.e2e\.mjs|location-checkin\.e2e\.mjs|mobile-nav-contrast\.e2e\.mjs|event-cover\.e2e\.mjs/,
    },
    {
      name: "role-shells-1440",
      testMatch: roleShellCoreTestMatch,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "role-shells-1024",
      testMatch: roleShellCoreTestMatch,
      use: { viewport: { width: 1024, height: 900 } },
    },
    {
      name: "role-shells-768",
      testMatch: roleShellCoreTestMatch,
      use: { viewport: { width: 768, height: 900 } },
    },
    {
      name: "role-shells-412",
      testMatch: roleShellCoreTestMatch,
      use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625 },
    },
    {
      name: "role-shells-375",
      testMatch: roleShellCoreTestMatch,
      use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: "role-shells-320",
      testMatch: roleShellCoreTestMatch,
      use: { viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
    {
      name: "role-shells-disabled",
      testMatch: roleShellDisabledTestMatch,
      testIgnore: rollbackScenario === "disabled" ? undefined : /.*/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "role-shells-force-legacy",
      testMatch: roleShellForceTestMatch,
      testIgnore: rollbackScenario === "force" ? undefined : /.*/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    ...[1440, 1024, 768, 412, 375, 320].map((width) => ({
      name: `event-create-${width}`,
      testMatch: eventCreateTestMatch,
      use: width <= 412
        ? { viewport: { width, height: width === 320 ? 700 : 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
        : { viewport: { width, height: 900 } },
    })),
    ...[1440, 1024, 768, 412, 375, 320].map((width) => ({
      name: `member-home-${width}`,
      testMatch: memberHomeCoreTestMatch,
      use: width <= 412
        ? { viewport: { width, height: width === 320 ? 700 : 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
        : { viewport: { width, height: 900 } },
    })),
    ...[1440, 1024, 768, 412, 375, 320].map((width) => ({
      name: `dynamic-checkin-${width}`,
      testMatch: dynamicCheckinTestMatch,
      use: width <= 412
        ? { viewport: { width, height: width === 320 ? 700 : 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
        : { viewport: { width, height: 900 } },
    })),
    ...[1440, 412, 320].map((width) => ({
      name: `location-checkin-${width}`,
      testMatch: locationCheckinTestMatch,
      use: width <= 412
        ? { viewport: { width, height: width === 320 ? 700 : 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
        : { viewport: { width, height: 900 } },
    })),
    ...[412, 375, 320].map((width) => ({
      name: `mobile-nav-${width}`,
      testMatch: mobileNavTestMatch,
      use: { viewport: { width, height: width === 320 ? 700 : 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    })),
    ...[1440, 412].map((width) => ({
      name: `event-cover-${width}`,
      testMatch: eventCoverTestMatch,
      use: width <= 412
        ? { viewport: { width, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
        : { viewport: { width, height: 900 } },
    })),
    {
      name: "dynamic-checkin-disabled",
      testMatch: dynamicCheckinOffTestMatch,
      testIgnore: dynamicCheckinRollbackScenario === "disabled" ? undefined : /.*/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "member-home-disabled",
      testMatch: memberHomeDisabledTestMatch,
      testIgnore: memberHomeRollbackScenario === "disabled" ? undefined : /.*/,
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "member-home-force-legacy",
      testMatch: memberHomeForceTestMatch,
      testIgnore: memberHomeRollbackScenario === "force" ? undefined : /.*/,
      use: { viewport: { width: 1440, height: 900 } },
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
        env: {
          ...process.env,
          ...(process.env.E2E_FORCE_LEGACY_ROLE_SHELLS === "true" ? { FORCE_LEGACY_ROLE_SHELLS: "true" } : {}),
          ...(process.env.E2E_FORCE_LEGACY_MEMBER_HOME === "true" ? { FORCE_LEGACY_MEMBER_HOME: "true" } : {}),
        },
      },
});
