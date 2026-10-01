import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../../../.github/workflows/message-center-scheduler.yml", import.meta.url), "utf8");

describe("message centre scheduler workflow", () => {
  it("uses only the protected staging scheduler environment and route", () => {
    expect(workflow).toContain('cron: "*/5 * * * *"');
    expect(workflow).toContain("if: ${{ github.ref == 'refs/heads/main' && (github.event_name != 'schedule' || vars.MESSAGE_CENTER_SCHEDULER_ENABLED == 'true') }}");
    expect(workflow).toContain("environment:\n      name: message-center-scheduler");
    expect(workflow).toContain("/api/internal/message-center/scheduler");
    expect(workflow).not.toContain("production");
  });
});
