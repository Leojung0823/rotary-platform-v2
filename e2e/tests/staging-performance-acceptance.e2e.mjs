import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { isPublicHostname } from "../../src/lib/public-hostname.mjs";

const memberEmail = process.env.STAGING_TEST_MEMBER_EMAIL;
const memberPassword = process.env.STAGING_TEST_MEMBER_PASSWORD;
const operatorEmail = process.env.STAGING_TEST_OPERATOR_EMAIL;
const operatorPassword = process.env.STAGING_TEST_OPERATOR_PASSWORD;
const expectedClubName = process.env.STAGING_EXPECTED_CLUB_NAME;
const expectedSha = process.env.E2E_EXPECTED_SHA;
const baseURL = process.env.E2E_BASE_URL;
const sampleCount = Number(process.env.STAGING_PERFORMANCE_SAMPLE_COUNT ?? "3");
const outputPath = process.env.STAGING_PERFORMANCE_OUTPUT;

function requireStagingConfiguration() {
  if (!memberEmail || !memberPassword || !operatorEmail || !operatorPassword
    || !expectedClubName || !expectedSha || !baseURL || !outputPath) {
    throw new Error("Protected staging performance acceptance configuration is incomplete.");
  }

  const parsed = new URL(baseURL);
  if (parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
    || !isPublicHostname(parsed.hostname)) {
    throw new Error("Staging performance acceptance requires a public, credential-free HTTPS origin.");
  }
  if (!/^[a-f0-9]{40}$/u.test(expectedSha)) {
    throw new Error("E2E_EXPECTED_SHA must be an exact 40-character staging commit SHA.");
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 5) {
    throw new Error("STAGING_PERFORMANCE_SAMPLE_COUNT must be an integer from 1 through 5.");
  }
}

async function login(page, email, password) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "歡迎回來" })).toBeVisible();
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/u);
}

async function installPerformanceObservers(page) {
  await page.addInitScript(() => {
    window.__rotaryStagingPerformance = {
      lcp: null,
      interactionDurations: [],
    };

    if (typeof PerformanceObserver === "undefined") return;

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const current = window.__rotaryStagingPerformance.lcp;
          if (!current || entry.startTime >= current.startTime) {
            window.__rotaryStagingPerformance.lcp = { startTime: entry.startTime };
          }
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // The acceptance fails closed if LCP is unavailable when metrics are read.
    }

    try {
      const interactionObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.interactionId > 0 && Number.isFinite(entry.duration)) {
            window.__rotaryStagingPerformance.interactionDurations.push(entry.duration);
          }
        }
      });
      interactionObserver.observe({ type: "event", buffered: true, durationThreshold: 16 });
    } catch {
      // The acceptance fails closed if INP cannot be captured after the click.
    }
  });
}

async function expectHealth(request) {
  const response = await request.get("/api/health", {
    headers: { "cache-control": "no-cache" },
  });
  expect(response.status()).toBe(200);
  const health = await response.json();
  expect(health.status).toBe("ok");
  expect(health.environment).toBe("staging");
  expect(health.revision).toBe(expectedSha.slice(0, 12));
  expect(health.checks?.configuration).toBe(true);
  expect(health.checks?.database).toBe(true);
  expect(health.issues).toEqual([]);
}

async function collectMetrics(page) {
  await page.waitForFunction(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const lcp = window.__rotaryStagingPerformance?.lcp;
    return Number.isFinite(fcp?.startTime) && Number.isFinite(lcp?.startTime);
  }, undefined, { timeout: 10_000 });

  const coreMetrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const lcp = window.__rotaryStagingPerformance?.lcp;
    const round = (value) => Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
    return {
      lcpMs: round(lcp?.startTime),
      fcpMs: round(fcp?.startTime),
      ttfbMs: round(navigation?.responseStart - navigation?.startTime),
    };
  });

  expect(coreMetrics.lcpMs).not.toBeNull();
  expect(coreMetrics.fcpMs).not.toBeNull();
  expect(coreMetrics.ttfbMs).not.toBeNull();

  const accountMenu = page.getByLabel("帳號選單");
  await expect(accountMenu).toHaveCount(1);
  await accountMenu.click();
  await page.waitForTimeout(100);

  const inpMs = await page.evaluate(() => {
    const interactionDurations = window.__rotaryStagingPerformance?.interactionDurations ?? [];
    if (interactionDurations.length === 0) return null;
    return Math.round(Math.max(...interactionDurations) * 10) / 10;
  });
  expect(inpMs).not.toBeNull();
  return { ...coreMetrics, inpMs };
}

async function measureRoute(page, { label, route, heading }) {
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await heading();
    samples.push({ sample: index + 1, ...(await collectMetrics(page)) });
  }
  return { label, samples };
}

async function writeResults(results) {
  await writeFile(outputPath, `${JSON.stringify({
    expectedSha,
    sampleCount,
    routes: results,
  }, null, 2)}\n`, "utf8");
}

test.describe("受保護的 Hosted staging 登入後效能基線", () => {
  test.skip(process.env.E2E_REMOTE !== "1", "Hosted staging performance acceptance only runs in protected remote mode.");

  test.beforeAll(() => {
    requireStagingConfiguration();
  });

  test("同一 staging runtime 量測社員與社務管理首頁", async ({ page, browser, request }) => {
    test.setTimeout(150_000);
    await expectHealth(request);

    await installPerformanceObservers(page);
    await login(page, memberEmail, memberPassword);
    const memberResults = await measureRoute(page, {
      label: "member-dashboard",
      route: "/dashboard?mode=member",
      heading: async () => {
        await expect(page.getByRole("heading", { level: 1, name: /，您好$/u })).toBeVisible();
      },
    });

    const operatorContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const operatorPage = await operatorContext.newPage();
    try {
      await installPerformanceObservers(operatorPage);
      await login(operatorPage, operatorEmail, operatorPassword);
      const managementResults = await measureRoute(operatorPage, {
        label: "management-dashboard",
        route: "/dashboard?mode=management",
        heading: async () => {
          await expect(operatorPage.getByText("社務管理模式", { exact: true }).first()).toBeVisible();
          await expect(operatorPage.getByText(expectedClubName, { exact: true }).first()).toBeVisible();
        },
      });
      await writeResults([memberResults, managementResults]);
    } finally {
      await operatorContext.close();
    }
  });
});
