import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE } from "./time";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/u.test(entry) || entry.includes(".test.")) return [];
    return [path];
  });
}

describe("displayed timestamps", () => {
  it("never formats a date without saying which zone it is in", () => {
    // Pages render on the server, so a formatter with no timeZone uses the
    // server's zone -- UTC on Render. That shows a reader in Taipei a time
    // eight hours behind, formatted to look local.
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/new Intl\.DateTimeFormat\(/gu)) {
        const window = text.slice(match.index, match.index + 420);
        if (!window.includes("timeZone")) {
          offenders.push(`${file}:${text.slice(0, match.index).split("\n").length}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses the club default zone", () => {
    expect(APP_TIME_ZONE).toBe("Asia/Taipei");
  });
});
