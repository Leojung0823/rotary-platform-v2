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
    path: ".github/workflows/staging-release.yml",
    repository: { full_name: "Leojung0823/rotary-platform-v2", fork: false },
    head_repository: { full_name: "Leojung0823/rotary-platform-v2", fork: false },
  };
}

const validJobs = [{
  name: "Staging migration plan",
  status: "completed",
  conclusion: "success",
  head_sha: sha,
  steps: [
    { name: "Preview remote migrations", status: "completed", conclusion: "success" },
    { name: "Apply remote migrations", status: "completed", conclusion: "skipped" },
  ],
}];

const options = {
  expectedSha: sha,
  expectedRepository: "Leojung0823/rotary-platform-v2",
  expectedRunId: "30536951086",
  now,
};

describe("staging plan run verification", () => {
  it("accepts a recent successful plan for the exact SHA", () => {
    expect(inspectStagingPlanRun(validRun(), validJobs, options)).toEqual({
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
    }], options);

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
    }, validJobs, options);
    expect(stale.errors).toContain("PLAN_RUN_EXPIRED");

    const future = inspectStagingPlanRun({
      ...validRun(),
      created_at: "2026-07-30T13:00:00.000Z",
    }, validJobs, options);
    expect(future.errors).toContain("PLAN_RUN_EXPIRED");
  });

  it("rejects another repository, fork head, workflow path or run id", () => {
    const result = inspectStagingPlanRun({
      ...validRun(),
      id: 999,
      path: ".github/workflows/other.yml",
      repository: { full_name: "someone/other", fork: false },
      head_repository: { full_name: "attacker/rotary-platform-v2", fork: true },
    }, validJobs, options);

    expect(result.errors).toEqual(expect.arrayContaining([
      "PLAN_RUN_ID_MISMATCH",
      "PLAN_REPOSITORY_MISMATCH",
      "PLAN_HEAD_REPOSITORY_MISMATCH",
      "PLAN_WORKFLOW_PATH_MISMATCH",
    ]));
  });

  it("rejects a non-canonical uppercase expected SHA", () => {
    const result = inspectStagingPlanRun(validRun(), validJobs, {
      ...options,
      expectedSha: sha.toUpperCase(),
    });
    expect(result.errors).toContain("EXPECTED_SHA_INVALID");
  });

  it("rejects an apply operation or a plan whose dry-run did not pass", () => {
    const apply = inspectStagingPlanRun(validRun(), [{
      ...validJobs[0],
      steps: [
        { name: "Preview remote migrations", status: "completed", conclusion: "failure" },
        { name: "Apply remote migrations", status: "completed", conclusion: "success" },
      ],
    }], options);
    expect(apply.errors).toEqual(expect.arrayContaining([
      "PLAN_DRY_RUN_NOT_SUCCESSFUL",
      "PLAN_OPERATION_NOT_PLAN",
    ]));
  });
});
