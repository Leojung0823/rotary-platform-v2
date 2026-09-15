import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globals = readFileSync("src/app/globals.css", "utf8");

// WCAG 2.1 relative luminance and contrast ratio.
function luminance(hex: string): number {
  const value = hex.replace("#", "");
  const channel = (pair: string) => {
    const v = Number.parseInt(pair, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(value.slice(0, 2))
    + 0.7152 * channel(value.slice(2, 4))
    + 0.0722 * channel(value.slice(4, 6));
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function token(name: string): string {
  const found = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "iu").exec(globals);
  expect(found, `--${name} is not defined as a plain hex colour`).not.toBeNull();
  return found![1];
}

describe("colour contrast", () => {
  // The audit plan requires 4.5:1 for text. Nothing checked it until now: the
  // guards measured type size and touch size only, so --subtle-ink sat at
  // 3.05:1 on white for as long as it existed, and a blue chosen for its
  // appearance as a fill was used as a label at 4.14:1.
  const surfaces = () => ({ white: "#ffffff", canvas: token("canvas"), surface: token("surface") });

  it("keeps every text colour readable on the surfaces it is drawn on", () => {
    const failures: string[] = [];
    for (const name of ["ink", "muted", "subtle-ink", "blue-ink", "danger"]) {
      const colour = token(name);
      for (const [surfaceName, surface] of Object.entries(surfaces())) {
        const ratio = contrast(colour, surface);
        if (ratio < 4.5) failures.push(`--${name} (${colour}) on ${surfaceName}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures, "text below 4.5:1").toEqual([]);
  });

  it("keeps white legible on the colours that get filled", () => {
    const failures: string[] = [];
    for (const name of ["blue", "danger", "navy"]) {
      const ratio = contrast("#ffffff", token(name));
      if (ratio < 4.5) failures.push(`white on --${name} (${token(name)}): ${ratio.toFixed(2)}:1`);
    }
    expect(failures, "button labels below 4.5:1").toEqual([]);
  });

  it("never lets gold carry text", () => {
    // Stated in the plan and worth a number: the brand gold is around 1.9:1 on
    // white, so it fails as text by a factor of two whatever the size.
    expect(contrast(token("gold"), "#ffffff")).toBeLessThan(3);
    expect(globals).not.toMatch(/color:\s*var\(--gold\)/u);
  });
});
