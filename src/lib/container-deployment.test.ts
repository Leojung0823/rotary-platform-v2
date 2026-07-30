import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile", "utf8");
const dockerignore = readFileSync(".dockerignore", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");

describe("portable staging container", () => {
  it("builds a Node.js 24 standalone image in multiple stages", () => {
    expect(nextConfig).toContain('output: "standalone"');
    expect(dockerfile.match(/^FROM node:24-alpine/gmu)?.length).toBeGreaterThanOrEqual(3);
    expect(dockerfile).toContain("/app/.next/standalone");
    expect(dockerfile).toContain('CMD ["node", "server.js"]');
  });

  it("runs as a non-root user on configurable host and port", () => {
    expect(dockerfile).toContain("adduser --system --uid 1001 --ingroup nodejs nextjs");
    expect(dockerfile).toContain("USER nextjs");
    expect(dockerfile).toContain("ENV HOSTNAME=0.0.0.0");
    expect(dockerfile).toContain("ENV PORT=3000");
  });

  it("has a bounded application healthcheck", () => {
    expect(dockerfile).toContain("HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3");
    expect(dockerfile).toContain('http://127.0.0.1:${PORT:-3000}/api/health');
  });

  it("excludes secrets, Git metadata, tests, reports and local database state", () => {
    for (const ignored of [
      ".git", ".env*", "node_modules", "e2e", "supabase", "**/*.test.ts",
      "coverage", "playwright-report", "test-results", "blob-report",
    ]) {
      expect(dockerignore.split("\n"), ignored).toContain(ignored);
    }
  });
});
