#!/usr/bin/env node

import { inspectStagingPlanRun } from "../src/lib/staging-plan-run.mjs";

const repository = String(process.env.GITHUB_REPOSITORY ?? "").trim();
const token = String(process.env.GITHUB_TOKEN ?? "");
const runId = String(process.env.STAGING_PLAN_RUN_ID ?? "").trim();
const expectedSha = String(process.env.STAGING_EXPECTED_SHA ?? "").trim();

if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/iu.test(repository)) {
  console.error("ERROR GITHUB_REPOSITORY_INVALID");
  process.exit(1);
}
if (!/^[1-9]\d{0,19}$/u.test(runId)) {
  console.error("ERROR STAGING_PLAN_RUN_ID_INVALID");
  process.exit(1);
}
if (token.length < 20 || /[\r\n]/u.test(token)) {
  console.error("ERROR GITHUB_TOKEN_INVALID");
  process.exit(1);
}

const headers = {
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "user-agent": "rotary-platform-staging-go-live/1.0",
  "x-github-api-version": "2022-11-28",
};

async function githubJson(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub API request failed with status ${response.status}.`);
  }
  return response.json();
}

try {
  const [owner, repo] = repository.split("/").map(encodeURIComponent);
  const run = await githubJson(`/repos/${owner}/${repo}/actions/runs/${runId}`);
  const jobsResponse = await githubJson(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`);
  const result = inspectStagingPlanRun(run, jobsResponse.jobs, {
    expectedSha,
    expectedRepository: repository,
    expectedRunId: runId,
  });

  console.log(`Referenced plan run: ${result.runId ?? "invalid"}`);
  console.log(`Referenced plan SHA: ${result.headSha ?? "invalid"}`);

  if (!result.ok) {
    for (const error of result.errors) console.error(`ERROR ${error}`);
    console.error("Referenced staging plan is not eligible for go-live.");
    process.exit(1);
  }

  console.log("Referenced staging migration plan is successful, recent, and matches the exact main commit.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to verify staging plan run.");
  process.exit(1);
}
