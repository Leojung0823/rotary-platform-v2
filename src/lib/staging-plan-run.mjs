const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;

function text(value) {
  return String(value ?? "").trim();
}

/**
 * Validate GitHub Actions metadata for a successful staging migration plan.
 * @param {Record<string, unknown>} run
 * @param {Array<Record<string, unknown>>} jobs
 * @param {{expectedSha: string, now?: Date, maxAgeHours?: number}} options
 */
export function inspectStagingPlanRun(run, jobs, options) {
  const errors = [];
  const expectedSha = text(options?.expectedSha).toLowerCase();
  const maxAgeHours = Number(options?.maxAgeHours ?? 24);
  const now = options?.now instanceof Date ? options.now : new Date();

  if (!COMMIT_SHA_PATTERN.test(expectedSha)) errors.push("EXPECTED_SHA_INVALID");
  if (text(run?.name) !== "Staging Release") errors.push("PLAN_WORKFLOW_NAME_MISMATCH");
  if (text(run?.event) !== "workflow_dispatch") errors.push("PLAN_EVENT_MISMATCH");
  if (text(run?.head_branch) !== "main") errors.push("PLAN_BRANCH_MISMATCH");
  if (text(run?.head_sha).toLowerCase() !== expectedSha) errors.push("PLAN_SHA_MISMATCH");
  if (text(run?.status) !== "completed" || text(run?.conclusion) !== "success") {
    errors.push("PLAN_RUN_NOT_SUCCESSFUL");
  }

  const createdAt = new Date(text(run?.created_at));
  if (Number.isNaN(createdAt.getTime())) {
    errors.push("PLAN_CREATED_AT_INVALID");
  } else if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0
    || now.getTime() - createdAt.getTime() > maxAgeHours * 60 * 60 * 1000
    || createdAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    errors.push("PLAN_RUN_EXPIRED");
  }

  const planJob = Array.isArray(jobs)
    ? jobs.find((job) => text(job?.name) === "Staging migration plan")
    : undefined;
  if (!planJob || text(planJob.status) !== "completed" || text(planJob.conclusion) !== "success") {
    errors.push("PLAN_JOB_NOT_SUCCESSFUL");
  }

  return {
    ok: errors.length === 0,
    runId: Number.isSafeInteger(Number(run?.id)) ? String(run.id) : null,
    headSha: COMMIT_SHA_PATTERN.test(text(run?.head_sha).toLowerCase())
      ? text(run.head_sha).toLowerCase()
      : null,
    errors,
  };
}
