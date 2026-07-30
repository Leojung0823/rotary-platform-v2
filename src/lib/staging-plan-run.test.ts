import { describe, expect, it } from "vitest";
import { inspectStagingPlanRun } from "./staging-plan-run.mjs";

const sha = "a".repeat(40);
const now = new Date("2026-07-30T12:00:00.000Z");

function validRun() {
  return {
    id: 30536951086,
    name: "Staging Release",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: sha,
    status: "completed",
    conclusion: "success",
    created_at: "2026-07-30T11:00:00.000Z",
  };
}

const validJobs = [{
  name: "Staging migration plan",
  status: "completed",
  conclusion: "success",
}];

describe("staging plan run verification", () => {
  it("accepts a recent successful plan for the exact SHA", () => {
    expect(inspectStagingPlanRun(validRun(), validJobs, { expectedSha: sha, now })).toEqual({
      ok: true,
      runId: "30536951086",
      headSha: sha,
      errors: [],
    });
  });

  it("rejects apply jobs, mismatched revisions and unsuccessful runs", () => {
    const result = inspectStagingPlanRun({
      ...validRun(),
      head_sha: "b".repeat(40),
      conclusion: "failure",
    }, [{
      name: "Staging migration apply",
      status: "completed",
      conclusion: "success",
    }], { expectedSha: sha, now });

    expect(result.errors).toEqual(expect.arrayContaining([
      "PLAN_SHA_MISMATCH",
      "PLAN_RUN_NOT_SUCCESSFUL",
      "PLAN_JOB_NOT_SUCCESSFUL",
    ]));
  });

  it("rejects stale or future plan runs", () => {
    const stale = inspectStagingPlanRun({
      ...validRun(),
      created_at: "2026-07-28T00:00:00.000Z",
    }, validJobs, { expectedSha: sha, now });
    expect(stale.errors).toContain("PLAN_RUN_EXPIRED");

    const future = inspectStagingPlanRun({
      ...validRun(),
      created_at: "2026-07-30T13:00:00.000Z",
    }, validJobs, { expectedSha: sha, now });
    expect(future.errors).toContain("PLAN_RUN_EXPIRED");
  });
});
