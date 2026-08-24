import { expect, test } from "@playwright/test";

const password = process.env.E2E_ROLE_PASSWORD;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// The current tab is the one at risk: it is the only item styled differently,
// and the bug this guards made it white-on-white and therefore invisible.
const minimumContrast = 4.5;

function requireCredentials() {
  if (!password) throw new Error("E2E_ROLE_PASSWORD is required for mobile navigation contrast tests.");
}

async function login(page, email) {
  requireCredentials();
  await page.goto(new URL("/login", baseURL).toString());
  await page.getByLabel("電子郵件").fill(email);
  await page.getByLabel("密碼").fill(password);
  await page.getByRole("button", { name: "登入平台" }).click();
  await expect(page).toHaveURL(/\/dashboard$/u);
}

// Measured in the page so it reflects what actually painted, including any
// background the item does or does not draw for itself.
async function navigationContrast(page) {
  return page.evaluate(() => {
    const relativeLuminance = ([r, g, b]) => {
      const channel = (value) => {
        const v = value / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const parse = (value) => value.match(/[\d.]+/gu).slice(0, 3).map(Number);
    const isTransparent = (value) => /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/u.test(value) || value === "transparent";

    const navigation = document.querySelector('nav[aria-label="主要導覽"]');
    if (!navigation) return null;
    const barBackground = parse(getComputedStyle(navigation).backgroundColor);

    return [...navigation.querySelectorAll("a")].map((anchor) => {
      const style = getComputedStyle(anchor);
      const behind = isTransparent(style.backgroundColor) ? barBackground : parse(style.backgroundColor);
      const [lighter, darker] = [relativeLuminance(parse(style.color)), relativeLuminance(behind)]
        .sort((a, b) => b - a);
      return {
        label: anchor.innerText.trim().replace(/\s+/gu, " "),
        current: anchor.getAttribute("aria-current") === "page",
        contrast: (lighter + 0.05) / (darker + 0.05),
      };
    });
  });
}

test("every mobile navigation tab stays readable, including the current one", async ({ page }, testInfo) => {
  await login(page, "e2e-shell-ordinary@example.test");
  await expect(page.getByRole("navigation", { name: "主要導覽" })).toBeVisible();

  const items = await navigationContrast(page);
  expect(items).not.toBeNull();
  expect(items.length).toBeGreaterThan(1);

  const current = items.filter((item) => item.current);
  expect(current, `expected exactly one current tab at ${testInfo.project.name}`).toHaveLength(1);

  for (const item of items) {
    expect(
      item.contrast,
      `"${item.label}"${item.current ? " (current tab)" : ""} is ${item.contrast.toFixed(2)}:1 against the bar`,
    ).toBeGreaterThanOrEqual(minimumContrast);
  }

  // Mobile Safari and Chromium can keep the last tapped link in :hover. It
  // must not apply the desktop white-on-dark hover treatment to the white bar.
  const bar = page.getByRole("navigation", { name: "主要導覽" });
  const links = bar.getByRole("link");
  for (let index = 0; index < await links.count(); index += 1) {
    await links.nth(index).hover();
    const hovered = await links.nth(index).evaluate((anchor) => {
      const icon = anchor.querySelector("svg");
      const style = getComputedStyle(anchor);
      const iconStyle = icon ? getComputedStyle(icon) : null;
      return {
        color: style.color,
        background: style.backgroundColor,
        iconColor: iconStyle?.color ?? null,
        iconStroke: iconStyle?.stroke ?? null,
      };
    });
    expect(hovered.color).not.toBe("rgb(255, 255, 255)");
    expect(hovered.iconStroke).not.toBe("rgb(255, 255, 255)");
  }
});
