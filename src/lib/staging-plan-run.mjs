const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const REPOSITORY_PATTERN = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu;
const RUN_ID_PATTERN = /^[1-9]\d{0,19}$/u;
const STAGING_RELEASE_PATH = ".github/workflows/staging-release.yml";

function text(value) {
  return String(value ?? "").trim();
}

/**
 * Validate GitHub Actions metadata for a successful staging migration plan.
 * @param {Record<string, unknown>} run
 * @param {Array<Record<string, unknown>>} jobs
 * @param {{expectedSha: string, expectedRepository: string, expectedRunId?: string, now?: Date, maxAgeHours?: number}} options
 */
export function inspectStagingPlanRun(run, jobs, options) {
  const errors = [];
  const expectedSha = text(options?.expectedSha);
  const expectedRepository = text(options?.expectedRepository).toLowerCase();
  const expectedRunId = text(options?.expectedRunId);
  const maxAgeHours = Number(options?.maxAgeHours ?? 24);
  const now = options?.now instanceof Date ? options.now : new Date();

  if (!COMMIT_SHA_PATTERN.test(expectedSha)) errors.push("EXPECTED_SHA_INVALID");
  if (!REPOSITORY_PATTERN.test(expectedRepository)) errors.push("EXPECTED_REPOSITORY_INVALID");
  if (expectedRunId && !RUN_ID_PATTERN.test(expectedRunId)) errors.push("EXPECTED_RUN_ID_INVALID");
  if (expectedRunId && text(run?.id) !== expectedRunId) errors.push("PLAN_RUN_ID_MISMATCH");
  if (text(run?.repository?.full_name).toLowerCase() !== expectedRepository
    || run?.repository?.fork === true) {
    errors.push("PLAN_REPOSITORY_MISMATCH");
  }
  if (text(run?.head_repository?.full_name).toLowerCase() !== expectedRepository
    || run?.head_repository?.fork === true) {
    errors.push("PLAN_HEAD_REPOSITORY_MISMATCH");
  }
  if (text(run?.name) !== "Staging Release") errors.push("PLAN_WORKFLOW_NAME_MISMATCH");
  if (text(run?.path) !== STAGING_RELEASE_PATH) errors.push("PLAN_WORKFLOW_PATH_MISMATCH");
  if (text(run?.event) !== "workflow_dispatch") errors.push("PLAN_EVENT_MISMATCH");
  if (text(run?.head_branch) !== "main") errors.push("PLAN_BRANCH_MISMATCH");
  if (text(run?.head_sha) !== expectedSha) errors.push("PLAN_SHA_MISMATCH");
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

  const planJobs = Array.isArray(jobs)
    ? jobs.filter((job) => text(job?.name) === "Staging migration plan")
    : [];
  const planJob = planJobs.length === 1 ? planJobs[0] : undefined;
  if (!planJob || text(planJob.status) !== "completed" || text(planJob.conclusion) !== "success") {
    errors.push("PLAN_JOB_NOT_SUCCESSFUL");
  } else {
    if (text(planJob.head_sha) !== expectedSha) errors.push("PLAN_JOB_SHA_MISMATCH");
    const steps = Array.isArray(planJob.steps) ? planJob.steps : [];
    const dryRun = steps.find((step) => text(step?.name) === "Preview remote migrations");
    const apply = steps.find((step) => text(step?.name) === "Apply remote migrations");
    if (!dryRun || text(dryRun.status) !== "completed" || text(dryRun.conclusion) !== "success") {
      errors.push("PLAN_DRY_RUN_NOT_SUCCESSFUL");
    }
    if (apply && !["skipped", "neutral"].includes(text(apply.conclusion))) {
      errors.push("PLAN_OPERATION_NOT_PLAN");
    }
  }

  return {
    ok: errors.length === 0,
    runId: Number.isSafeInteger(Number(run?.id)) ? String(run.id) : null,
    headSha: COMMIT_SHA_PATTERN.test(text(run?.head_sha))
      ? text(run.head_sha)
      : null,
    errors,
  };
}
