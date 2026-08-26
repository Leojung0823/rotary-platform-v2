import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/browser-smoke.yml", "utf8");

describe("browser smoke workflow security", () => {
  it("does not keep reusable test passwords in the repository", () => {
    expect(workflow).not.toMatch(/E2E_ADMIN_PASSWORD:\s+\S+/u);
    expect(workflow).not.toMatch(/E2E_ROLE_PASSWORD:\s+\S+/u);
    expect(workflow).not.toMatch(/VERIFY_OPERATOR_PASSWORD=Rotary-/u);
    expect(workflow).toContain("Generate ephemeral local E2E credentials");
    expect(workflow).toContain('echo "::add-mask::$admin_password"');
    expect(workflow).toContain('echo "::add-mask::$role_password"');
    expect(workflow).toContain('echo "::add-mask::$operator_password"');
  });
});
