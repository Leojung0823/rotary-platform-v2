import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../../../.github/workflows/birthday-collection-scheduler.yml", import.meta.url), "utf8");

describe("birthday collection scheduler workflow", () => {
  it("runs only against the protected staging environment", () => {
    expect(workflow).toContain('cron: "17 0 * * *"');
    expect(workflow).toContain("environment:\n      name: staging");
    expect(workflow).toContain("vars.STAGING_BASE_URL");
    expect(workflow).toContain("secrets.BIRTHDAY_COLLECTION_SCHEDULER_SECRET");
    expect(workflow).toContain("/api/internal/birthday-collection/scheduler");
    expect(workflow).not.toContain("production");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
