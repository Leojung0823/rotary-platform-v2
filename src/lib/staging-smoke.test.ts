import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const smoke = readFileSync("scripts/smoke-staging.mjs", "utf8");

describe("staging smoke coverage", () => {
  it("checks health, exact revision, configuration, database and public issues", () => {
    expect(smoke).toContain('health.status !== 200');
    expect(smoke).toContain('snapshot.status !== "ok"');
    expect(smoke).toContain("snapshot.revision !== expectedSha.slice(0, 12)");
    expect(smoke).toContain("snapshot.checks?.configuration !== true");
    expect(smoke).toContain("snapshot.checks?.database !== true");
    expect(smoke).toContain("!Array.isArray(snapshot.issues) || snapshot.issues.length !== 0");
  });

  it("checks public routes, security headers, HSTS and noindex", () => {
    for (const path of ["/login", "/forgot-password", "/status", "/robots.txt"]) {
      expect(smoke).toContain(`"${path}"`);
    }
    for (const header of [
      "x-content-type-options", "x-frame-options", "referrer-policy",
      "strict-transport-security", "x-robots-tag",
    ]) {
      expect(smoke).toContain(header);
    }
  });

  it("requires an anonymous same-origin dashboard redirect to login", () => {
    expect(smoke).toContain('request("/dashboard")');
    expect(smoke).toContain("redirectTarget.origin !== baseUrl.origin");
    expect(smoke).toContain('redirectTarget.pathname !== "/login"');
  });
});
